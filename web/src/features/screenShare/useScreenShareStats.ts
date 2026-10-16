import { useScreenShareStore } from "@/features/screenShare/stores/screenShareStore";
import type { ScreenShareCaptureStats, ScreenSharePeerStats } from "@/features/screenShare/screenShareTypes";

export type ScreenShareStatsRecord = Record<string, unknown>;

export function screenShareStatsRecord(value: unknown): ScreenShareStatsRecord {
  return value && typeof value === "object" ? (value as ScreenShareStatsRecord) : {};
}

export function screenShareStatsNumber(stats: ScreenShareStatsRecord | undefined, key: string): number | null {
  const value = stats?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function screenShareStatsString(stats: ScreenShareStatsRecord | undefined, key: string): string | null {
  const value = stats?.[key];
  return typeof value === "string" && value ? value : null;
}

export function screenShareVideoStatsKind(stats: ScreenShareStatsRecord): string {
  return screenShareStatsString(stats, "kind") ?? screenShareStatsString(stats, "mediaType") ?? "";
}

export interface ScreenShareStatsDeps {
  /** The peer maps are owned by `useScreenSharePeers`; the poll only reads them. */
  peers: Map<string, RTCPeerConnection>;
  peerRoles: Map<string, "owner" | "viewer">;
  localStream: () => MediaStream | null;
}

/** Screen share statistics: per-peer samples, the previous-sample map, and the one-second poll.
 *  State is non-reactive closure state; only `screenShareWebRtcStats` lives in the store. */
export function useScreenShareStats(deps: ScreenShareStatsDeps) {
  const { screenShareWebRtcStats } = useScreenShareStore();
  const screenSharePeers = deps.peers;
  const screenSharePeerRoles = deps.peerRoles;
  const screenShareStatsPrevious = new Map<string, { sampledAt: number; bytes: number | null; frames: number | null }>();
  let screenShareStatsTimer: ReturnType<typeof setInterval> | null = null;
  let screenShareStatsCollecting = false;

  function screenShareStatsCapture(): ScreenShareCaptureStats | null {
    const track = deps.localStream()?.getVideoTracks()[0];
    if (!track) return null;
    const settings = track.getSettings();
    return {
      width: typeof settings.width === "number" ? settings.width : null,
      height: typeof settings.height === "number" ? settings.height : null,
      frameRate: typeof settings.frameRate === "number" ? settings.frameRate : null,
    };
  }

  async function collectScreenSharePeerStats(
    peerId: string,
    peer: RTCPeerConnection,
    role: "owner" | "viewer",
  ): Promise<ScreenSharePeerStats | null> {
    try {
      const report = await peer.getStats();
      const records = new Map<string, ScreenShareStatsRecord>();
      let mediaStats: ScreenShareStatsRecord | undefined;
      let remoteInboundStats: ScreenShareStatsRecord | undefined;
      let trackStats: ScreenShareStatsRecord | undefined;
      let candidatePairStats: ScreenShareStatsRecord | undefined;
      report.forEach((raw) => {
        const stats = screenShareStatsRecord(raw);
        const id = screenShareStatsString(stats, "id");
        if (id) records.set(id, stats);
        const type = screenShareStatsString(stats, "type");
        const kind = screenShareVideoStatsKind(stats);
        if (type === "outbound-rtp" && kind === "video" && role === "owner") mediaStats = stats;
        if (type === "inbound-rtp" && kind === "video" && role === "viewer") mediaStats = stats;
        if (type === "remote-inbound-rtp" && kind === "video" && role === "owner") remoteInboundStats = stats;
        if (type === "track" && kind === "video") trackStats = stats;
        if (
          type === "candidate-pair" &&
          (stats.selected === true || stats.nominated === true || screenShareStatsString(stats, "state") === "succeeded")
        )
          candidatePairStats = stats;
      });

      const codecId = screenShareStatsString(mediaStats, "codecId");
      const codecStats = codecId ? records.get(codecId) : undefined;
      const localCandidateId = screenShareStatsString(candidatePairStats, "localCandidateId");
      const localCandidate = localCandidateId ? records.get(localCandidateId) : undefined;
      const remoteCandidateId = screenShareStatsString(candidatePairStats, "remoteCandidateId");
      const remoteCandidate = remoteCandidateId ? records.get(remoteCandidateId) : undefined;
      const remoteStats = role === "owner" ? remoteInboundStats : undefined;
      const frames =
        screenShareStatsNumber(mediaStats, role === "owner" ? "framesEncoded" : "framesDecoded") ??
        screenShareStatsNumber(mediaStats, role === "owner" ? "framesSent" : "framesReceived");
      const bytes = screenShareStatsNumber(mediaStats, role === "owner" ? "bytesSent" : "bytesReceived");
      const now = performance.now();
      const previous = screenShareStatsPrevious.get(peerId);
      const elapsedMs = previous ? now - previous.sampledAt : 0;
      const derivedFrameRate =
        previous && elapsedMs >= 250 && frames !== null && previous.frames !== null
          ? Math.max(0, ((frames - previous.frames) * 1_000) / elapsedMs)
          : null;
      const derivedBitrateKbps =
        previous && elapsedMs >= 250 && bytes !== null && previous.bytes !== null
          ? Math.max(0, ((bytes - previous.bytes) * 8) / elapsedMs)
          : null;
      screenShareStatsPrevious.set(peerId, { sampledAt: now, bytes, frames });

      const packetsLost = screenShareStatsNumber(remoteStats ?? mediaStats, "packetsLost");
      const packetsTransferred = screenShareStatsNumber(mediaStats, role === "owner" ? "packetsSent" : "packetsReceived");
      const packetsTotal = packetsTransferred === null || packetsLost === null ? null : packetsTransferred + packetsLost;
      const lossPercent = packetsTotal && packetsTotal > 0 && packetsLost !== null ? (packetsLost / packetsTotal) * 100 : null;
      const currentRoundTripTime =
        screenShareStatsNumber(remoteStats, "roundTripTime") ?? screenShareStatsNumber(candidatePairStats, "currentRoundTripTime");
      const jitter = screenShareStatsNumber(remoteStats ?? mediaStats, "jitter");
      const directFrameRate =
        screenShareStatsNumber(mediaStats, "framesPerSecond") ?? screenShareStatsNumber(trackStats, "framesPerSecond");
      const directBitrateKbps =
        screenShareStatsNumber(mediaStats, "bitrate") !== null ? (screenShareStatsNumber(mediaStats, "bitrate") as number) / 1_000 : null;
      return {
        peerId,
        role,
        direction: role === "owner" ? "outbound" : "inbound",
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        codec: screenShareStatsString(codecStats, "mimeType"),
        candidateType: screenShareStatsString(localCandidate, "candidateType") ?? screenShareStatsString(remoteCandidate, "candidateType"),
        width: screenShareStatsNumber(mediaStats, "frameWidth") ?? screenShareStatsNumber(trackStats, "frameWidth"),
        height: screenShareStatsNumber(mediaStats, "frameHeight") ?? screenShareStatsNumber(trackStats, "frameHeight"),
        frameRate: directFrameRate !== null && directFrameRate > 0 ? directFrameRate : derivedFrameRate,
        bitrateKbps: directBitrateKbps ?? derivedBitrateKbps,
        packetsLost,
        packetsTotal,
        lossPercent,
        framesDropped: screenShareStatsNumber(mediaStats, "framesDropped") ?? screenShareStatsNumber(trackStats, "framesDropped"),
        jitterMs: jitter === null ? null : jitter * 1_000,
        roundTripTimeMs: currentRoundTripTime === null ? null : currentRoundTripTime * 1_000,
        availableOutgoingBitrateKbps:
          screenShareStatsNumber(candidatePairStats, "availableOutgoingBitrate") === null
            ? null
            : (screenShareStatsNumber(candidatePairStats, "availableOutgoingBitrate") as number) / 1_000,
        qualityLimitationReason: screenShareStatsString(mediaStats, "qualityLimitationReason"),
      };
    } catch {
      return null;
    }
  }

  async function collectScreenShareWebRtcStats(): Promise<void> {
    if (screenShareStatsCollecting || !screenSharePeers.size) return;
    screenShareStatsCollecting = true;
    try {
      const peers = await Promise.all(
        [...screenSharePeers.entries()].map(async ([peerId, peer]) => {
          const role = screenSharePeerRoles.get(peerId) ?? "viewer";
          return collectScreenSharePeerStats(peerId, peer, role);
        }),
      );
      screenShareWebRtcStats.capture = screenShareStatsCapture();
      screenShareWebRtcStats.peers = peers.filter((stats): stats is ScreenSharePeerStats => stats !== null);
      screenShareWebRtcStats.updatedAt = Date.now();
    } finally {
      screenShareStatsCollecting = false;
    }
  }

  function startScreenShareStatsPolling(): void {
    if (screenShareStatsTimer) return;
    void collectScreenShareWebRtcStats();
    screenShareStatsTimer = setInterval(() => {
      void collectScreenShareWebRtcStats();
    }, 1_000);
  }

  function stopScreenShareStatsPolling(): void {
    if (screenShareStatsTimer) {
      clearInterval(screenShareStatsTimer);
      screenShareStatsTimer = null;
    }
    screenShareStatsPrevious.clear();
    screenShareWebRtcStats.updatedAt = null;
    screenShareWebRtcStats.capture = null;
    screenShareWebRtcStats.peers = [];
  }

  function forgetPeerStats(peerId: string): void {
    screenShareStatsPrevious.delete(peerId);
  }

  return { startScreenShareStatsPolling, stopScreenShareStatsPolling, forgetPeerStats };
}
