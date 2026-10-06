import { WebSocket } from "ws";
import type { IdentityLeaseStore } from "../../teamspeak/index.js";
import type { Logger as LoggerType } from "../../../shared/logger.js";
import { formatTeamSpeakTarget } from "../../../shared/teamSpeakTarget.js";
import type { SessionManager, SessionTeardownReason } from "./voiceSessionManager.js";
import type { AdminSessionSummary, WebClientEntry } from "../voiceTypes.js";
import { snapshotAudioStats } from "../audio/audioStats.js";

/** What `cleanupEntry` still needs from the bridge. */
export interface SessionCleanupDeps {
  entries: Map<string, WebClientEntry>;
  identityLeases: IdentityLeaseStore;
  logger: LoggerType;
  removeScreenSharePeer(entryId: string): void;
  /** Forget every screen stream and every target's discovery mark. */
  forgetScreenStreams(): void;
}

export function getSessionSummaries(entries: Map<string, WebClientEntry>): AdminSessionSummary[] {
  const now = Date.now();
  return [...entries.values()]
    .sort((left, right) => left.session.createdAt - right.session.createdAt)
    .map((entry) => {
      let tsClientId: number | null = null;
      let channelId: string | null = null;
      try { tsClientId = entry.tsClient.getClientId() || null; } catch { /* still connecting */ }
      try {
        const id = entry.tsClient.getChannelId();
        channelId = id === 0n ? null : id.toString();
      } catch { /* still connecting */ }
      return {
        id: entry.id,
        nickname: entry.nickname,
        target: formatTeamSpeakTarget(entry.target),
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
  // With nobody connected, a native stream that ends now is never seen ending: forget every stream and
  // every target's discovery mark, so the next session that arrives asks fresh instead of listing a
  // stream that may already be gone (F20).
  if (entries.size === 0) deps.forgetScreenStreams();
  // The session is gone from the admin list and its client is unusable from here on, so the identity
  // is free now, not after the awaits below (F37): a rejoin must not be refused for a session nobody lists.
  if (entry.identityLeaseKey) identityLeases.release(entry.identityLeaseKey, entry.id);
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
  entry.opusEncoder = null;
  const webRtc = entry.webrtc;
  entry.webrtc = null;
  if (webRtc) {
    try { await webRtc.close(); } catch { /* peer teardown is idempotent */ }
    Object.assign(entry.audio, webRtc.getStats());
  }
  entry.whisperTargetIds.clear();
  entry.whisperActive = false;
  entry.channelTree = [];
  entry.members.clear();
  entry.tsClient.removeAllListeners();
  try { await entry.tsClient.disconnect(); } catch { /* disconnect is intentionally idempotent */ }
  // Only the listeners that read from the socket go. `ws` adds its own "close" listener to forget the
  // client (wss.clients), and the bridge's "close" and "error" listeners stay so that an "error"
  // after teardown is still handled; both end in a teardown that has already happened.
  entry.ws.removeAllListeners("message");
  entry.ws.removeAllListeners("pong");
  if (entry.ws.readyState === WebSocket.OPEN || entry.ws.readyState === WebSocket.CONNECTING) {
    // A heartbeat timeout means the peer is unresponsive: a close frame would just wait for an
    // acknowledgement that never comes. Shutdown is different (F17): the peer is fine, so it gets
    // a real code and reason instead of the 1006 a dropped network would show. A close that never
    // gets acknowledged does not hang the process: index.ts bounds the whole shutdown (F12).
    if (reason === "heartbeat-timeout") entry.ws.terminate();
    else if (reason === "gateway-shutdown") entry.ws.close(1001, reason);
    else entry.ws.close(reason === "protocol-error" ? 1008 : 1000, reason);
  }
  logger.info({
    entryId: entry.id,
    nickname: entry.nickname,
    clientIp: entry.clientIp,
    target: formatTeamSpeakTarget(entry.target),
    ...(entry.accelerationRelay ? { relayName: entry.accelerationRelay.name, relayTarget: entry.accelerationRelay.target } : {}),
    reason,
    ...(entry.connectionFailureCode ? { failureCode: entry.connectionFailureCode } : {}),
    durationSeconds: Math.max(0, Math.floor((Date.now() - entry.session.createdAt) / 1000)),
    audio: { ...entry.audio },
  }, "Client session torn down");
}
