import { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { identityFromString } from "@echosixhiya/teamspeak-client";
import {
  DirectorySynchronizer,
  TSClient,
  type IdentityLeaseStore,
  type TSClientOptions,
  type TSVoiceData,
  type TSRawNotification,
} from "../teamspeak/index.js";
import type { Logger as LoggerType } from "../../shared/logger.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey } from "../../shared/teamSpeakTarget.js";
import type { JoinTicketPayload } from "../join/index.js";
import type { ConfiguredAccelerationRelay } from "../relay/index.js";
import {
  handleRawScreenNotification,
  type ScreenShareClientMessage,
  type ScreenShareHub,
  type ScreenShareIceServer,
} from "../screenShare/index.js";
import type { WebRtcAudioOptions } from "../../config/webrtcConfig.js";
import type { SessionManager, SessionTeardownReason } from "./session/voiceSessionManager.js";
import type { VoiceConnection, WebClientEntry } from "./voiceTypes.js";
import { createAudioFlowStats } from "./audio/audioStats.js";
import { handleVoiceData } from "./audio/audioDownlink.js";
import { handleUplinkFrame } from "./audio/audioUplink.js";
import { createUplinkOpusEncoder } from "./audio/opusEncoder.js";
import { registerVoiceDirectory, type VoiceDirectoryDeps } from "./directory/voiceDirectory.js";
import { connectTeamSpeak, registerVoiceConnection } from "./session/voiceConnection.js";
import { registerVoiceChat } from "./messages/voiceChat.js";
import { resolveClientIp, resolveWebRtcPublicHost } from "./session/voiceRequestInfo.js";
import { routeTextFrame } from "./messages/voiceMessageRouter.js";

export interface ConnectionHooks {
  teardown(entryId: string, reason: SessionTeardownReason): Promise<void>;
  getWebRtcOptions(): WebRtcAudioOptions | undefined;
  handleScreenShareMessage(
    entry: WebClientEntry,
    message: ScreenShareClientMessage,
    sendJson: (message: Record<string, unknown>) => void,
  ): void;
  getScreenShareIceServers(): ScreenShareIceServer[];
  directorySyncTimeoutMs(): number;
  discoverExistingTeamSpeakStreams(entry: WebClientEntry): Promise<void>;
}

export interface AdmissionDeps {
  logger: LoggerType;
  sessionManager: SessionManager;
  entries: Map<string, WebClientEntry>;
  identityLeases: IdentityLeaseStore;
  screenHub: ScreenShareHub;
  hooks: ConnectionHooks;
  directoryDeps: VoiceDirectoryDeps;
  createClient?: (options: TSClientOptions, logger: LoggerType) => TSClient;
  resolveConnection(url: URL): JoinTicketPayload | null;
  getAccelerationOptions(relayId?: string): ConfiguredAccelerationRelay | undefined;
  teardown(entryId: string, reason: SessionTeardownReason): Promise<void>;
  cleanupEntry(entry: WebClientEntry, reason: SessionTeardownReason): Promise<void>;
}

/** Resolves the join ticket, admits the session and wires one connection, or closes the socket. */
export function admitConnection(deps: AdmissionDeps, ws: WebSocket, req: IncomingMessage): void {
  const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);
  const connection = deps.resolveConnection(url);
  if (!connection) {
    ws.close(4001, "Join ticket required");
    return;
  }

  const { target, serverPassword, nickname } = connection;
  const channelName = connection.channel;
  const acceleration = connection.accelerated ? deps.getAccelerationOptions(connection.accelerationRelayId) : undefined;
  if (connection.accelerated && !acceleration) {
    ws.close(4006, "ACCELERATION_UNAVAILABLE");
    return;
  }
  const clientIp = resolveClientIp(req);
  const webrtcPublicHost = resolveWebRtcPublicHost(req);
  let identity;
  try {
    identity = connection.identity ? identityFromString(connection.identity) : undefined;
  } catch {
    // Structured failure before the close so the browser can tell a bad remembered identity from a real failure.
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "connectionFailed", code: "IDENTITY_INVALID", detail: "Invalid identity" }));
    ws.close(4003, "IDENTITY_INVALID");
    return;
  }
  const entryId = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let admitted: VoiceConnection | null = null;
  const session = deps.sessionManager.admit(entryId, async (reason) => {
    // No context yet while the identity lease or client creation is still failing.
    if (!admitted) return;
    if (admitted.state.directoryTimer) clearTimeout(admitted.state.directoryTimer);
    admitted.state.directoryTimer = null;
    await deps.cleanupEntry(admitted.entry, reason);
  });
  if (!session) {
    deps.logger.warn({ max: deps.sessionManager.maxSessions }, "Max clients reached");
    ws.close(4004, "GATEWAY_FULL");
    return;
  }

  const identityLeaseKey = identity ? `${teamSpeakTargetKey(target)}:${identity.toString()}` : "";
  if (identityLeaseKey && !deps.identityLeases.acquire(identityLeaseKey, entryId)) {
    deps.logger.warn({ entryId, nickname, target: formatTeamSpeakTarget(target) }, "TeamSpeak identity already in use");
    void deps.sessionManager.teardown(entryId, "teamSpeak-connect-failed");
    ws.close(4005, "IDENTITY_IN_USE");
    return;
  }

  deps.logger.info(
    {
      entryId,
      nickname,
      clientIp,
      channel: channelName,
      target: formatTeamSpeakTarget(target),
      ...(acceleration
        ? {
            relayName: acceleration.name,
            relayTarget: formatTeamSpeakTarget({ host: acceleration.relayHost, port: acceleration.relayPort }),
          }
        : {}),
    },
    "WebClient connecting",
  );
  let tsClient: TSClient;
  try {
    const clientOptions: TSClientOptions = {
      target,
      nickname,
      serverPassword,
      defaultChannel: channelName,
      identity,
      ...(acceleration ? { acceleration } : {}),
    };
    tsClient = deps.createClient ? deps.createClient(clientOptions, deps.logger) : new TSClient(clientOptions, deps.logger);
  } catch (error: unknown) {
    if (identityLeaseKey) deps.identityLeases.release(identityLeaseKey, entryId);
    deps.logger.error({ err: error, entryId }, "Could not create TeamSpeak client");
    void deps.sessionManager.teardown(entryId, "teamSpeak-connect-failed");
    // A bare 4003 close would read as identity rejected, so send a structured failure saying the
    // TS client could not be created (server down or unreachable).
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "connectionFailed", code: "TEAM_SPEAK_CLIENT_UNAVAILABLE", detail: "TeamSpeak client unavailable" }));
    ws.close(4003, "TEAM_SPEAK_CLIENT_UNAVAILABLE");
    return;
  }
  const entry: WebClientEntry = {
    id: entryId,
    session,
    tsClient,
    ws,
    nickname,
    rememberIdentity: connection.rememberIdentity === true,
    clientIp,
    target,
    ...(acceleration
      ? {
          accelerationRelay: {
            name: acceleration.name,
            target: formatTeamSpeakTarget({ host: acceleration.relayHost, port: acceleration.relayPort }),
          },
        }
      : {}),
    ...(acceleration ? { acceleration } : {}),
    ...(identityLeaseKey ? { identityLeaseKey } : {}),
    ...(webrtcPublicHost ? { webrtcPublicHost } : {}),
    channelTree: [],
    members: new Map(),
    avatarCache: new Map(),
    eventLog: [],
    opusEncoder: null,
    opusEncoderWarnedAt: 0,
    invalidFrameWarnedAt: 0,
    whisperTargetIds: new Set(),
    whisperActive: false,
    isAlive: true,
    reconnectTimer: null,
    audio: createAudioFlowStats(),
    webrtc: null,
    lastLatencyProbeAt: 0,
    screenPeerId: entryId,
  };
  const ctx: VoiceConnection = {
    entry,
    session,
    ws,
    tsClient,
    logger: deps.logger,
    channelName,
    serverPassword,
    directory: new DirectorySynchronizer(),
    avatarRequests: new Set<string>(),
    sendJson: (message) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    },
    state: {
      tsReady: false,
      selfId: 0,
      selfChannelId: 0n,
      initialStateSent: false,
      audioReady: true,
      realtimeReady: false,
      hasConnectedOnce: false,
      pendingKickReason: null,
      reconnectStartedAt: 0,
      reconnectAttempt: 0,
      directoryTimer: null,
      avatarRefreshTimer: null,
      avatarRefreshRunning: false,
    },
  };
  admitted = ctx;
  deps.entries.set(entryId, ctx.entry);
  try {
    ctx.entry.opusEncoder = createUplinkOpusEncoder();
  } catch (error: unknown) {
    deps.logger.error({ err: error, entryId }, "Could not create Opus encoder");
    void deps.teardown(entryId, "teamSpeak-connect-failed");
    return;
  }

  // Register every directory listener before connect().
  ctx.state.realtimeReady = true;
  registerVoiceDirectory(ctx, deps.directoryDeps);

  ctx.tsClient.on("rawNotification", (notification: TSRawNotification) => {
    handleRawScreenNotification(deps.screenHub, ctx.entry, notification);
  });

  ctx.tsClient.on("voiceData", (data: TSVoiceData) => handleVoiceData(ctx, data));

  registerVoiceChat(ctx);

  registerVoiceConnection(ctx, deps.hooks);

  ctx.ws.on("pong", () => {
    ctx.entry.isAlive = true;
  });
  ctx.ws.on("message", (data: Buffer | string, isBinary: boolean) => {
    if (isBinary) {
      handleUplinkFrame(ctx, data);
      return;
    }

    routeTextFrame(ctx, data, deps.hooks);
  });

  ctx.ws.on("close", () => {
    ctx.logger.info({ entryId }, "WebSocket closed");
    void deps.teardown(entryId, "websocket-close");
  });

  ctx.ws.on("error", (error) => {
    ctx.logger.error({ err: error, entryId }, "WebSocket error");
    void deps.teardown(entryId, "websocket-error");
  });

  try {
    ctx.session.transition("connecting");
    ctx.session.transition("authenticating");
  } catch (error: unknown) {
    ctx.logger.error({ err: error instanceof Error ? error.message : String(error), entryId }, "Session state initialization failed");
    void deps.teardown(entryId, "protocol-error");
    return;
  }

  void connectTeamSpeak(ctx, deps.hooks, false);
}
