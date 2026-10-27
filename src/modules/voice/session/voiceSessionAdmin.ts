import { WebSocket } from "ws";
import type { IdentityLeaseStore } from "../../teamspeak/index.js";
import type { Logger as LoggerType } from "../../../shared/logger.js";
import { formatTeamSpeakTarget } from "../../../shared/teamSpeakTarget.js";
import type { SessionManager, SessionTeardownReason } from "./voiceSessionManager.js";
import type { SessionRecorder } from "./voiceSessionRecorder.js";
import type { AdminSessionSummary, WebClientEntry } from "../voiceTypes.js";
import { snapshotAudioStats, summarizeAudioStats } from "../audio/audioStats.js";

export interface SessionCleanupDeps {
  entries: Map<string, WebClientEntry>;
  identityLeases: IdentityLeaseStore;
  logger: LoggerType;
  sessionRecorder?: SessionRecorder;
  removeScreenSharePeer(entryId: string): void;
  forgetScreenStreams(): void;
}

export function getSessionSummaries(entries: Map<string, WebClientEntry>): AdminSessionSummary[] {
  const now = Date.now();
  return [...entries.values()]
    .sort((left, right) => left.session.createdAt - right.session.createdAt)
    .map((entry) => {
      let tsClientId: number | null = null;
      let channelId: string | null = null;
      try {
        tsClientId = entry.tsClient.getClientId() || null;
      } catch {
        /* still connecting */
      }
      try {
        const id = entry.tsClient.getChannelId();
        channelId = id === 0n ? null : id.toString();
      } catch {
        /* still connecting */
      }
      return {
        id: entry.id,
        nickname: entry.nickname,
        target: formatTeamSpeakTarget(entry.target),
        clientIp: entry.clientIp,
        relayName: entry.accelerationRelay?.name ?? null,
        relayTarget: entry.accelerationRelay?.target ?? null,
        state: entry.session.state,
        createdAt: new Date(entry.session.createdAt).toISOString(),
        ageSeconds: Math.max(0, Math.floor((now - entry.session.createdAt) / 1000)),
        tsClientId,
        channelId,
        memberCount: entry.members.size,
        audio: snapshotAudioStats(entry),
      };
    });
}

export async function terminateSession(
  entries: Map<string, WebClientEntry>,
  sessionManager: SessionManager,
  entryId: string,
): Promise<boolean> {
  if (!entries.has(entryId)) return false;
  await sessionManager.teardown(entryId, "admin-terminated");
  return true;
}

export async function cleanupEntry(entry: WebClientEntry, reason: SessionTeardownReason, deps: SessionCleanupDeps): Promise<void> {
  const { entries, identityLeases, logger } = deps;
  deps.removeScreenSharePeer(entry.id);
  if (entries.get(entry.id) === entry) entries.delete(entry.id);
  // With nobody connected a native stream that ends is never seen ending. Forget all streams and
  // discovery marks so the next session asks fresh.
  if (entries.size === 0) deps.forgetScreenStreams();
  // The session is gone from the admin list, so free the identity now and not after the awaits,
  // or a rejoin gets refused.
  if (entry.identityLeaseKey) identityLeases.release(entry.identityLeaseKey, entry.id);
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
  entry.opusEncoder?.dispose();
  entry.opusEncoder = null;
  const webRtc = entry.webrtc;
  entry.webrtc = null;
  if (webRtc) {
    try {
      await webRtc.close();
    } catch {
      /* peer teardown is idempotent */
    }
    Object.assign(entry.audio, webRtc.getStats());
  }
  entry.whisperTargetIds.clear();
  entry.whisperActive = false;
  entry.channelTree = [];
  entry.members.clear();
  entry.tsClient.removeAllListeners();
  try {
    await entry.tsClient.disconnect();
  } catch {
    /* disconnect is intentionally idempotent */
  }
  // Only the socket-reading listeners go. ws keeps its own close listener and the bridge's close
  // and error listeners stay so an error after teardown is still handled.
  entry.ws.removeAllListeners("message");
  entry.ws.removeAllListeners("pong");
  if (entry.ws.readyState === WebSocket.OPEN || entry.ws.readyState === WebSocket.CONNECTING) {
    // Heartbeat timeout means the peer is dead, a close frame would wait for an ack forever. Shutdown gets
    // a real close code instead of 1006, and index.ts bounds the whole shutdown.
    if (reason === "heartbeat-timeout") entry.ws.terminate();
    else if (reason === "gateway-shutdown") entry.ws.close(1001, reason);
    else entry.ws.close(reason === "protocol-error" ? 1008 : 1000, reason);
  }
  logger.info(
    {
      entryId: entry.id,
      nickname: entry.nickname,
      clientIp: entry.clientIp,
      target: formatTeamSpeakTarget(entry.target),
      ...(entry.accelerationRelay ? { relayName: entry.accelerationRelay.name, relayTarget: entry.accelerationRelay.target } : {}),
      reason,
      ...(entry.connectionFailureCode ? { failureCode: entry.connectionFailureCode } : {}),
      durationSeconds: Math.max(0, Math.floor((Date.now() - entry.session.createdAt) / 1000)),
      audio: { ...entry.audio },
    },
    "Client session torn down",
  );
  deps.sessionRecorder?.ended(entry.id, {
    reason,
    ...(entry.connectionFailureCode ? { failureCode: entry.connectionFailureCode } : {}),
    ...(entry.connectionFailureDetail ? { failureDetail: entry.connectionFailureDetail } : {}),
    durationSeconds: Math.max(0, Math.floor((Date.now() - entry.session.createdAt) / 1000)),
    audio: summarizeAudioStats(entry.audio),
  });
}
