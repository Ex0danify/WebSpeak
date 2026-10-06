import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { identityFromString } from "@echosixhiya/teamspeak-client";
import { DirectorySynchronizer } from "../teamspeak/index.js";
import { TSClient, type TSClientOptions, type TSVoiceData, type TSRawNotification } from "../teamspeak/index.js";
import type { Logger as LoggerType } from "../../shared/logger.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey } from "../../shared/teamSpeakTarget.js";
import { JoinTicketStore, type JoinTicketPayload } from "../join/index.js";
import { IdentityLeaseStore } from "../teamspeak/index.js";
import { SessionManager, type ManagedSession, type SessionTeardownReason } from "./session/voiceSessionManager.js";
import type { AdminSessionSummary, AudioFlowStats, VoiceConnection, WebClientEntry } from "./voiceTypes.js";
import { createAudioFlowStats } from "./audio/audioStats.js";
import { handleVoiceData } from "./audio/audioDownlink.js";
import { handleUplinkFrame } from "./audio/audioUplink.js";
import { createUplinkOpusEncoder } from "./audio/opusEncoder.js";
import { registerVoiceDirectory, type VoiceDirectoryDeps } from "./directory/voiceDirectory.js";
import { connectTeamSpeak, registerVoiceConnection, sendInitialState } from "./session/voiceConnection.js";
import { registerVoiceChat } from "./messages/voiceChat.js";
import { resolveClientIp, resolveWebRtcPublicHost } from "./session/voiceRequestInfo.js";
import type { WebRtcAudioOptions } from "../../config/webrtcConfig.js";
import { routeTextFrame } from "./messages/voiceMessageRouter.js";
import { cleanupEntry, getSessionSummaries, terminateSession, type SessionCleanupDeps } from "./session/voiceSessionAdmin.js";
import type { AccelerationRelayOptions, ConfiguredAccelerationRelay } from "../relay/index.js";
import { ScreenShareHub, discoverExistingTeamSpeakStreams, handleRawScreenNotification, handleScreenShareMessage, normalizeScreenShareIceServers, type ScreenShareClientMessage, type ScreenShareIceServer } from "../screenShare/index.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface VoiceBridgeOptions {
  joinTickets: JoinTicketStore;
  webRtc?: WebRtcAudioOptions | (() => WebRtcAudioOptions);
  screenShareIceServers?: ScreenShareIceServer[] | (() => ScreenShareIceServer[]);
  acceleration?: ConfiguredAccelerationRelay[] | (() => ConfiguredAccelerationRelay[]);
  accelerationName?: string | (() => string | undefined);
  createClient?: (options: TSClientOptions, logger: LoggerType) => TSClient;
  /** How long a connected TeamSpeak client may take to deliver its first directory snapshot. */
  directorySyncTimeoutMs?: number;
}

const DIRECTORY_SYNC_TIMEOUT_MS = 15_000;

/** What the per-connection functions still need from the bridge. */
interface ConnectionHooks {
  teardown(entryId: string, reason: SessionTeardownReason): Promise<void>;
  getWebRtcOptions(): WebRtcAudioOptions | undefined;
  handleScreenShareMessage(entry: WebClientEntry, message: ScreenShareClientMessage, sendJson: (message: Record<string, unknown>) => void): void;
  getScreenShareIceServers(): ScreenShareIceServer[];
  directorySyncTimeoutMs(): number;
  discoverExistingTeamSpeakStreams(entry: WebClientEntry): Promise<void>;
}

export class VoiceBridge {
  private readonly sessionManager = new SessionManager();
  private readonly entries = new Map<string, WebClientEntry>();
  private readonly screenHub: ScreenShareHub;
  private readonly identityLeases = new IdentityLeaseStore();
  private wss: WebSocketServer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private logger: LoggerType;
  private readonly hooks: ConnectionHooks;
  private readonly directoryDeps: VoiceDirectoryDeps;
  private readonly cleanupDeps: SessionCleanupDeps;

  constructor(
    private options: VoiceBridgeOptions,
    logger: LoggerType,
  ) {
    this.logger = logger.child({ component: "voice-bridge" });
    this.screenHub = new ScreenShareHub({
      getParticipant: (entryId) => this.entries.get(entryId),
      participants: () => this.entries.values(),
      getIceServers: () => this.getScreenShareIceServers(),
      logger: this.logger,
    });
    this.hooks = {
      teardown: (entryId, reason) => this.teardown(entryId, reason),
      getWebRtcOptions: () => this.getWebRtcOptions(),
      handleScreenShareMessage: (entry, message, sendJson) => handleScreenShareMessage(this.screenHub, entry, message, sendJson),
      getScreenShareIceServers: () => this.getScreenShareIceServers(),
      directorySyncTimeoutMs: () => this.options.directorySyncTimeoutMs ?? DIRECTORY_SYNC_TIMEOUT_MS,
      discoverExistingTeamSpeakStreams: (entry) => discoverExistingTeamSpeakStreams(this.screenHub, entry),
    };
    this.directoryDeps = {
      sendInitialState: (ctx) => sendInitialState(ctx, this.hooks),
      reconcileScreenShareAfterClientMove: (entry, clientId, targetChannelId) => this.screenHub.reconcileScreenShareAfterClientMove(entry, clientId, targetChannelId),
      reconcileNativeScreenShareAfterClientLeave: (entry, clientId) => this.screenHub.reconcileNativeScreenShareAfterClientLeave(entry, clientId),
    };
    this.cleanupDeps = {
      entries: this.entries,
      identityLeases: this.identityLeases,
      logger: this.logger,
      removeScreenSharePeer: (entryId) => this.screenHub.removeScreenSharePeer(entryId),
      forgetScreenStreams: () => {
        this.screenHub.screenStreams.clear();
        this.screenHub.screenStreamDiscoveryTargets.clear();
      },
    };
  }

  attach(server: Server): void {
    // Avatar data is delivered as a data URL in a memberAvatar message. Keep
    // the frame limit above the encoded avatar ceiling with room for JSON.
    this.wss = new WebSocketServer({ server, path: "/ws/voice", maxPayload: 512 * 1024 });
    this.startHeartbeat();

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);
      const connection = this.resolveConnection(url);
      if (!connection) {
        ws.close(4001, "Join ticket required");
        return;
      }

      const { target, serverPassword, nickname } = connection;
      const channelName = connection.channel;
      const acceleration = connection.accelerated ? this.getAccelerationOptions(connection.accelerationRelayId) : undefined;
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
        // Send a structured failure before the close so the browser can tell
        // an invalid remembered identity apart from a real connection failure.
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "connectionFailed", code: "IDENTITY_INVALID", detail: "Invalid identity" }));
        ws.close(4003, "IDENTITY_INVALID");
        return;
      }
      const entryId = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      let admitted: VoiceConnection | null = null;
      const session = this.sessionManager.admit(entryId, async (reason) => {
        // No context yet while the identity lease or client creation is still failing.
        if (!admitted) return;
        if (admitted.state.directoryTimer) clearTimeout(admitted.state.directoryTimer);
        admitted.state.directoryTimer = null;
        await this.cleanupEntry(admitted.entry, reason);
      });
      if (!session) {
        this.logger.warn({ max: this.sessionManager.maxSessions }, "Max clients reached");
        ws.close(4004, "GATEWAY_FULL");
        return;
      }

      const identityLeaseKey = identity
        ? `${teamSpeakTargetKey(target)}:${identity.toString()}`
        : "";
      if (identityLeaseKey && !this.identityLeases.acquire(identityLeaseKey, entryId)) {
        this.logger.warn({ entryId, nickname, target: formatTeamSpeakTarget(target) }, "TeamSpeak identity already in use");
        void this.sessionManager.teardown(entryId, "teamSpeak-connect-failed");
        ws.close(4005, "IDENTITY_IN_USE");
        return;
      }

      this.logger.info({
        entryId,
        nickname,
        clientIp,
        channel: channelName,
        target: formatTeamSpeakTarget(target),
        ...(acceleration ? { relayName: acceleration.name, relayTarget: formatTeamSpeakTarget({ host: acceleration.relayHost, port: acceleration.relayPort }) } : {}),
      }, "WebClient connecting");
      let tsClient: TSClient;
      try {
        const clientOptions: TSClientOptions = { target, nickname, serverPassword, defaultChannel: channelName, identity, ...(acceleration ? { acceleration } : {}) };
        tsClient = this.options.createClient ? this.options.createClient(clientOptions, this.logger) : new TSClient(clientOptions, this.logger);
      } catch (error: unknown) {
        if (identityLeaseKey) this.identityLeases.release(identityLeaseKey, entryId);
        this.logger.error({ err: error, entryId }, "Could not create TeamSpeak client");
        // A 4003 with a bare close used to be reported as "identity rejected".
        // Send a structured failure so the browser says the TeamSpeak client
        // could not be created (server down / unreachable) instead.
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "connectionFailed", code: "TEAM_SPEAK_CLIENT_UNAVAILABLE", detail: "TeamSpeak client unavailable" }));
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
        ...(acceleration ? { accelerationRelay: { name: acceleration.name, target: formatTeamSpeakTarget({ host: acceleration.relayHost, port: acceleration.relayPort }) } } : {}),
        ...(acceleration ? { acceleration } : {}),
        ...(identityLeaseKey ? { identityLeaseKey } : {}),
        ...(webrtcPublicHost ? { webrtcPublicHost } : {}),
        channelTree: [],
        members: new Map(),
        avatarCache: new Map(),
        eventLog: [],
        opusEncoder: null,
        opusEncoderWarnedAt: 0,
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
        logger: this.logger,
        channelName,
        serverPassword,
        directory: new DirectorySynchronizer(),
        avatarRequests: new Set<string>(),
        sendJson: (message) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); },
        state: {
          tsReady: false, selfId: 0, selfChannelId: 0n, initialStateSent: false, audioReady: true, realtimeReady: false,
          hasConnectedOnce: false, pendingKickReason: null, reconnectStartedAt: 0, reconnectAttempt: 0,
          directoryTimer: null, avatarRefreshTimer: null, avatarRefreshRunning: false,
        },
      };
      admitted = ctx;
      this.entries.set(entryId, ctx.entry);
      try {
        ctx.entry.opusEncoder = createUplinkOpusEncoder();
      } catch (error: unknown) {
        this.logger.error({ err: error, entryId }, "Could not create Opus encoder");
        void this.teardown(entryId, "teamSpeak-connect-failed");
        return;
      }

      // Register every directory listener before connect().
      ctx.state.realtimeReady = true;
      registerVoiceDirectory(ctx, this.directoryDeps);

      ctx.tsClient.on("rawNotification", (notification: TSRawNotification) => {
        handleRawScreenNotification(this.screenHub, ctx.entry, notification);
      });

      ctx.tsClient.on("voiceData", (data: TSVoiceData) => handleVoiceData(ctx, data));

      registerVoiceChat(ctx);

      registerVoiceConnection(ctx, this.hooks);

      ctx.ws.on("pong", () => { ctx.entry.isAlive = true; });
      ctx.ws.on("message", (data: Buffer | string, isBinary: boolean) => {
        if (isBinary) {
          handleUplinkFrame(ctx, data);
          return;
        }

        routeTextFrame(ctx, data, this.hooks);
      });

      ctx.ws.on("close", () => {
        ctx.logger.info({ entryId }, "WebSocket closed");
        void this.teardown(entryId, "websocket-close");
      });

      ctx.ws.on("error", (error) => {
        ctx.logger.error({ err: error, entryId }, "WebSocket error");
        void this.teardown(entryId, "websocket-error");
      });

      try {
        ctx.session.transition("connecting");
        ctx.session.transition("authenticating");
      } catch (error: unknown) {
        ctx.logger.error({ err: error instanceof Error ? error.message : String(error), entryId }, "Session state initialization failed");
        void this.teardown(entryId, "protocol-error");
        return;
      }

      void connectTeamSpeak(ctx, this.hooks, false);
    });

    this.wss.on("error", (error) => {
      this.logger.error({ err: error }, "Voice WebSocket server error");
    });
    this.logger.info("Voice WebSocket endpoint ready at /ws/voice");
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    await this.sessionManager.shutdown("gateway-shutdown");
    const wss = this.wss;
    this.wss = null;
    if (!wss) return;
    await new Promise<void>((resolve) => {
      try { wss.close(() => resolve()); } catch { resolve(); }
    });
  }

  getActiveCount(): number {
    return this.sessionManager.activeCount;
  }

  getPeakCount(): number {
    return this.sessionManager.peakCount;
  }

  getCreatedCount(): number {
    return this.sessionManager.createdCount;
  }

  getSessionSummaries(): AdminSessionSummary[] {
    return getSessionSummaries(this.entries);
  }

  async terminateSession(entryId: string): Promise<boolean> {
    return terminateSession(this.entries, this.sessionManager, entryId);
  }

  private async teardown(entryId: string, reason: SessionTeardownReason): Promise<void> {
    await this.sessionManager.teardown(entryId, reason);
  }

  private async cleanupEntry(entry: WebClientEntry, reason: SessionTeardownReason): Promise<void> {
    await cleanupEntry(entry, reason, this.cleanupDeps);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      for (const entry of this.entries.values()) {
        if (entry.ws.readyState !== WebSocket.OPEN) continue;
        if (!entry.isAlive) {
          entry.ws.terminate();
          void this.teardown(entry.id, "heartbeat-timeout");
          continue;
        }
        entry.isAlive = false;
        entry.ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private resolveConnection(url: URL): JoinTicketPayload | null {
    const token = url.searchParams.get("ticket");
    return token ? this.options.joinTickets.consume(token) : null;
  }

  private getWebRtcOptions(): WebRtcAudioOptions | undefined {
    const configured = this.options.webRtc;
    return typeof configured === "function" ? configured() : configured;
  }

  private getScreenShareIceServers(): ScreenShareIceServer[] {
    const configured = this.options.screenShareIceServers;
    const servers = typeof configured === "function" ? configured() : configured;
    return normalizeScreenShareIceServers(servers);
  }

  private getAccelerationOptions(relayId = ""): ConfiguredAccelerationRelay | undefined {
    const configured = this.options.acceleration;
    const relays = typeof configured === "function" ? configured() : configured;
    if (!relays?.length) return undefined;
    const selected = relayId ? relays.find((relay) => relay.id === relayId) : relays[0];
    if (!selected) return undefined;
    return selected;
  }
}
