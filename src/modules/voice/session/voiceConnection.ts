import type { SessionRecorder } from "./voiceSessionRecorder.js";
import { WebSocket } from "ws";
import {
  clientConnectionFailureCode,
  describeTeamSpeakError,
  normalizeTeamSpeakError,
  WEBSPEAK_ERROR_MESSAGES,
  WebSpeakError,
} from "../../../shared/errors.js";
import { formatTeamSpeakTarget } from "../../../shared/teamSpeakTarget.js";
import { isRecoverable, reconnectDelayMs, reconnectWindowOpen } from "../../teamspeak/index.js";
import type { WebRtcAudioOptions } from "../../../config/webrtcConfig.js";
import type { ScreenShareIceServer } from "../../screenShare/index.js";
import type { SessionTeardownReason } from "./voiceSessionManager.js";
import type { VoiceConnection, WebClientEntry } from "../voiceTypes.js";
import { refreshDirectory, scheduleMemberAvatarRefresh } from "../directory/voiceDirectory.js";
import { publicFailureDetail } from "./voiceFailures.js";

export interface VoiceConnectionDeps {
  teardown(entryId: string, reason: SessionTeardownReason): Promise<void>;
  getWebRtcOptions(): WebRtcAudioOptions | undefined;
  getScreenShareIceServers(): ScreenShareIceServer[];
  directorySyncTimeoutMs(): number;
  discoverExistingTeamSpeakStreams(entry: WebClientEntry): Promise<void>;
  sessionRecorder?: SessionRecorder;
}

/** Registers the kick and disconnect listeners, call it before connect(). */
export function registerVoiceConnection(ctx: VoiceConnection, hooks: VoiceConnectionDeps): void {
  // A kick or ban is terminal, replay the server's reason instead of reconnecting into it.
  // The kick can follow the transport drop, so it also acts while a reconnect is pending.
  // That includes the settling states: a kick between authenticating and the first directory snapshot is just as final.
  ctx.tsClient.on("kicked", (kick: WebSpeakError) => {
    const state = ctx.session.state;
    const settling = isSettling(state);
    if (!settling && (!ctx.state.hasConnectedOnce || (state !== "connected" && state !== "interrupted" && state !== "reconnecting")))
      return;
    ctx.state.pendingKickReason = kick;
    if (settling) {
      // A connect() that rejects because of the same kick must not report it a second time.
      clearDirectoryTimer(ctx);
      ctx.session.transition("failed");
    }
    resetDirectoryForReconnect(ctx);
    const failureCode = clientConnectionFailureCode(kick, ctx.serverPassword);
    const failureDetail = publicFailureDetail(kick);
    ctx.entry.connectionFailureCode = failureCode;
    ctx.entry.connectionFailureDetail = describeTeamSpeakError(kick);
    ctx.logger.warn(
      { entryId: ctx.entry.id, code: failureCode, normalizedCode: kick.code, failureDetail: describeTeamSpeakError(kick) },
      "TeamSpeak session ended by kick/ban",
    );
    ctx.sendJson({ type: "connectionFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
    void hooks.teardown(ctx.entry.id, "teamSpeak-kicked");
  });

  ctx.tsClient.on("disconnected", (error?: Error) => {
    if (isSettling(ctx.session.state)) {
      handleSettlingDrop(ctx, hooks, error);
      return;
    }
    if (!ctx.state.hasConnectedOnce || ctx.session.state !== "connected") return;
    resetDirectoryForReconnect(ctx);
    // Prefer a kick reason over the generic transport error, whichever event comes first.
    const normalized = ctx.state.pendingKickReason ?? (error ? normalizeTeamSpeakError(error) : null);
    ctx.state.pendingKickReason = null;
    ctx.sendJson({ type: "disconnected", recoverable: isRecoverable(normalized) });
    scheduleReconnect(ctx, hooks, normalized);
  });
}

/** Between authenticating and the first directory snapshot the session is not yet "connected" but already depends on the transport. */
function isSettling(state: string): boolean {
  return state === "authenticating" || state === "syncing";
}

function clearDirectoryTimer(ctx: VoiceConnection) {
  if (ctx.state.directoryTimer) clearTimeout(ctx.state.directoryTimer);
  ctx.state.directoryTimer = null;
}

/**
 * The transport dropped before the session finished settling. Ignoring it would leave the browser on
 * "connecting" forever with nothing left to recover it, because connect() can resolve even when the
 * directory snapshot never arrives.
 */
function handleSettlingDrop(ctx: VoiceConnection, hooks: VoiceConnectionDeps, error?: Error) {
  clearDirectoryTimer(ctx);
  resetDirectoryForReconnect(ctx);
  // Same as an established session: a drop without an error is a plain transport loss and stays recoverable.
  const normalized = ctx.state.pendingKickReason ?? (error ? normalizeTeamSpeakError(error) : null);
  ctx.state.pendingKickReason = null;
  if (!ctx.state.hasConnectedOnce) {
    // A drop during the very first connect is a connect failure, not an interruption.
    handleConnectFailure(ctx, hooks, normalized ?? new Error("TeamSpeak connection lost"), false);
    return;
  }
  // A drop during a reconnect handshake goes back to waiting for the next attempt.
  ctx.session.transition("reconnecting");
  scheduleReconnect(ctx, hooks, normalized);
}

function scheduleReconnect(
  ctx: VoiceConnection,
  hooks: VoiceConnectionDeps,
  normalized: ReturnType<typeof normalizeTeamSpeakError> | null,
) {
  if (ctx.session.state === "disconnecting" || ctx.session.state === "idle" || ctx.session.state === "failed") return;
  if (!isRecoverable(normalized)) {
    failReconnect(ctx, hooks, normalized ?? normalizeTeamSpeakError(new Error("TeamSpeak connection failed")));
    return;
  }
  const now = Date.now();
  if (!ctx.state.reconnectStartedAt) ctx.state.reconnectStartedAt = now;
  ctx.state.reconnectAttempt += 1;
  if (!reconnectWindowOpen(ctx.state.reconnectStartedAt, now)) {
    failReconnect(ctx, hooks, normalized ?? normalizeTeamSpeakError(new Error("Reconnect window expired")));
    return;
  }
  if (ctx.session.state === "connected") ctx.session.transition("interrupted");
  if (ctx.session.state === "interrupted") ctx.session.transition("reconnecting");
  if (ctx.entry.reconnectTimer) return;
  const delayMs = reconnectDelayMs(ctx.state.reconnectAttempt);
  ctx.sendJson({ type: "reconnecting", attempt: ctx.state.reconnectAttempt, delayMs });
  ctx.entry.reconnectTimer = setTimeout(() => {
    ctx.entry.reconnectTimer = null;
    if (ctx.session.state !== "reconnecting") return;
    try {
      ctx.session.transition("connecting");
      ctx.session.transition("authenticating");
    } catch {
      failReconnect(ctx, hooks, normalizeTeamSpeakError(new Error("Reconnect state initialization failed")));
      return;
    }
    void connectTeamSpeak(ctx, hooks, true);
  }, delayMs);
  ctx.entry.reconnectTimer.unref?.();
}

function handleConnectFailure(ctx: VoiceConnection, hooks: VoiceConnectionDeps, error: unknown, isReconnect: boolean): void {
  // A transport that reports itself twice (a "disconnected" event plus a rejected connect()) fails once.
  const state = ctx.session.state;
  if (state === "failed" || state === "disconnecting" || state === "idle") return;
  const normalized = normalizeTeamSpeakError(error);
  const failureCode = clientConnectionFailureCode(normalized, ctx.serverPassword);
  const failureDetail = publicFailureDetail(normalized);
  ctx.entry.connectionFailureCode = failureCode;
  ctx.entry.connectionFailureDetail = describeTeamSpeakError(normalized);
  if (failureCode === "INVALID_SERVER_PASSWORD") ctx.reportPasswordOutcome?.(false);
  ctx.logger.warn(
    {
      code: failureCode,
      normalizedCode: normalized.code,
      failureDetail: describeTeamSpeakError(normalized),
      ...(Object.keys(normalized.diagnostics).length ? { failureDiagnostics: normalized.diagnostics } : {}),
      entryId: ctx.entry.id,
      reconnect: isReconnect,
      attempt: ctx.state.reconnectAttempt,
    },
    "TS connect failed",
  );
  if (!isReconnect) {
    try {
      if (ctx.session.state !== "disconnecting" && ctx.session.state !== "idle") ctx.session.transition("failed");
    } catch {
      /* teardown below remains authoritative */
    }
    // Send the structured failure before closing, some browsers and proxies drop the close reason
    // and everything would collapse into a generic message.
    ctx.sendJson({ type: "connectionFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
    if (ctx.ws.readyState === WebSocket.OPEN) ctx.ws.close(4003, failureCode);
    void hooks.teardown(ctx.entry.id, "teamSpeak-connect-failed");
    return;
  }
  if (isReconnect && isRecoverable(normalized)) {
    try {
      if (ctx.session.state !== "disconnecting" && ctx.session.state !== "idle") ctx.session.transition("reconnecting");
    } catch {
      /* teardown below remains authoritative */
    }
    scheduleReconnect(ctx, hooks, normalized);
    return;
  }
  failReconnect(ctx, hooks, normalized);
}

export async function connectTeamSpeak(ctx: VoiceConnection, hooks: VoiceConnectionDeps, isReconnect: boolean): Promise<void> {
  try {
    await ctx.tsClient.connect();
    if (ctx.session.state !== "authenticating") return;
    ctx.session.transition("syncing");
    ctx.state.tsReady = true;
    ctx.state.selfId = ctx.tsClient.getClientId();
    const sdkChannelId = ctx.tsClient.getChannelId();
    if (sdkChannelId !== 0n) ctx.state.selfChannelId = sdkChannelId;
    refreshDirectory(ctx);
    if (ctx.state.selfId > 0 && !ctx.entry.members.has(ctx.state.selfId)) {
      ctx.directory.applyClientEnter({
        id: ctx.state.selfId,
        nickname: ctx.entry.nickname,
        channelID: ctx.state.selfChannelId,
        uid: "",
        type: 1,
        serverGroups: [],
      });
      refreshDirectory(ctx);
    }
    sendInitialState(ctx, hooks);
    if (!ctx.state.initialStateSent) {
      // Without a directory snapshot the session would wait forever, fail it like a connect timeout.
      ctx.state.directoryTimer = setTimeout(() => {
        ctx.state.directoryTimer = null;
        if (ctx.state.initialStateSent || ctx.session.state !== "syncing") return;
        handleConnectFailure(
          ctx,
          hooks,
          new WebSpeakError("timeout", WEBSPEAK_ERROR_MESSAGES.timeout, true, undefined, {
            name: "DirectorySnapshotTimeout",
            message: "TeamSpeak did not deliver a directory snapshot",
          }),
          isReconnect,
        );
      }, hooks.directorySyncTimeoutMs());
      ctx.state.directoryTimer.unref?.();
    }
    void hooks.discoverExistingTeamSpeakStreams(ctx.entry);
  } catch (error: unknown) {
    handleConnectFailure(ctx, hooks, error, isReconnect);
  }
}

export function sendInitialState(ctx: VoiceConnection, hooks: VoiceConnectionDeps) {
  if (
    ctx.state.initialStateSent ||
    !ctx.state.tsReady ||
    !ctx.directory.ready ||
    !ctx.state.realtimeReady ||
    !ctx.state.audioReady ||
    ctx.session.state !== "syncing"
  )
    return;
  ctx.state.initialStateSent = true;
  if (ctx.state.directoryTimer) clearTimeout(ctx.state.directoryTimer);
  ctx.state.directoryTimer = null;
  const wasReconnecting = ctx.state.hasConnectedOnce;
  ctx.state.hasConnectedOnce = true;
  if (!wasReconnecting) ctx.reportPasswordOutcome?.(true);
  // A previous kick reason never applies to a fresh session.
  ctx.state.pendingKickReason = null;
  ctx.state.reconnectAttempt = 0;
  ctx.state.reconnectStartedAt = 0;
  if (!wasReconnecting) {
    ctx.entry.eventLog.push({
      id: `event-${Date.now().toString(36)}-connected`,
      kind: "connection",
      message: "Connected to the server",
      timestamp: Date.now(),
    });
    ctx.logger.info(
      {
        entryId: ctx.entry.id,
        nickname: ctx.entry.nickname,
        clientIp: ctx.entry.clientIp,
        target: formatTeamSpeakTarget(ctx.entry.target),
        ...(ctx.entry.accelerationRelay
          ? { relayName: ctx.entry.accelerationRelay.name, relayTarget: ctx.entry.accelerationRelay.target }
          : {}),
      },
      "Web client connected to TeamSpeak",
    );
    hooks.sessionRecorder?.connected(ctx.entry.id);
  }
  ctx.session.transition("connected");
  ctx.sendJson({
    type: "connected",
    tsClientId: ctx.state.selfId,
    members: Array.from(ctx.entry.members.values()),
    serverEventLog: ctx.entry.eventLog,
    whisperTargetIds: [...ctx.entry.whisperTargetIds],
    whisperActive: ctx.entry.whisperActive,
    canSpeak: ctx.entry.canSpeak,
    webrtcAvailable: hooks.getWebRtcOptions()?.enabled === true,
    screenShareIceServers: hooks.getScreenShareIceServers(),
    accelerated: Boolean(ctx.entry.acceleration),
    ...(ctx.entry.rememberIdentity ? { identity: ctx.tsClient.getIdentityString() } : {}),
  });
  ctx.sendJson({ type: "channelList", channels: ctx.entry.channelTree });
  if (wasReconnecting) ctx.sendJson({ type: "reconnected" });
  scheduleMemberAvatarRefresh(ctx);
}

function resetDirectoryForReconnect(ctx: VoiceConnection) {
  ctx.state.tsReady = false;
  ctx.state.initialStateSent = false;
  ctx.state.selfId = 0;
  ctx.state.selfChannelId = 0n;
  ctx.directory.clear();
  ctx.entry.channelTree = [];
  ctx.entry.members.clear();
  ctx.entry.whisperTargetIds.clear();
  ctx.entry.whisperActive = false;
  ctx.entry.canSpeak = true;
}

function failReconnect(ctx: VoiceConnection, hooks: VoiceConnectionDeps, normalized: ReturnType<typeof normalizeTeamSpeakError>) {
  if (ctx.entry.reconnectTimer) {
    clearTimeout(ctx.entry.reconnectTimer);
    ctx.entry.reconnectTimer = null;
  }
  try {
    if (ctx.session.state !== "disconnecting" && ctx.session.state !== "idle") ctx.session.transition("failed");
  } catch {
    /* teardown below remains authoritative */
  }
  const failureCode = clientConnectionFailureCode(normalized, ctx.serverPassword);
  const failureDetail = publicFailureDetail(normalized);
  ctx.entry.connectionFailureCode = failureCode;
  ctx.entry.connectionFailureDetail = describeTeamSpeakError(normalized);
  ctx.sendJson({ type: "reconnectFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
  void hooks.teardown(ctx.entry.id, "teamSpeak-connect-failed");
}
