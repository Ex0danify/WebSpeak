import type { Ref } from "vue";
import { text, type LocalizedText, type MaybeLocalizedText } from "@/shared/i18n/localizedText";
import { SCREEN_SHARE_NEGOTIATION_TIMEOUT_MS, getScreenShareIceServers } from "@/features/session";
import type { ScreenShareOutputSettings, ScreenShareStream } from "./screenShareTypes";
import { configureScreenShareVideoSender, preferScreenShareCodecs } from "./screenShareSender";
import type { useScreenShareStats } from "./useScreenShareStats";

/** Closure state and store refs the peer lifecycle works on. The maps are owned by `useScreenSharePeers`
 *  (the stats poll reads the same ones); the two getters read the capture state that stays there. */
export interface ScreenSharePeerContext {
  peers: Map<string, RTCPeerConnection>;
  peerRoles: Map<string, "owner" | "viewer">;
  pendingIce: Map<string, RTCIceCandidateInit[]>;
  peerStreams: Map<string, MediaStream>;
  stats: ReturnType<typeof useScreenShareStats>;
  streams: ScreenShareStream[];
  viewing: Ref<boolean>;
  viewingStreamId: Ref<string>;
  remoteStream: Ref<MediaStream | null>;
  error: Ref<MaybeLocalizedText>;
  errorCode: Ref<string>;
  send: (message: Record<string, unknown>) => void;
  localStream: () => MediaStream | null;
  outputSettings: () => ScreenShareOutputSettings | null;
}

/** Peer connections and their negotiation timers, covering create, arm/clear the timeout, close and fail. */
export function createScreenSharePeerLifecycle(ctx: ScreenSharePeerContext) {
  const peerTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearScreenSharePeerTimer(peerId: string): void {
    const timer = peerTimers.get(peerId);
    if (!timer) return;
    clearTimeout(timer);
    peerTimers.delete(peerId);
  }

  function armScreenSharePeerTimer(peerId: string): void {
    clearScreenSharePeerTimer(peerId);
    peerTimers.set(
      peerId,
      setTimeout(() => {
        peerTimers.delete(peerId);
        if (!ctx.peers.has(peerId)) return;
        failScreenSharePeer(peerId, text("screenShareP2PTimeout"));
      }, SCREEN_SHARE_NEGOTIATION_TIMEOUT_MS),
    );
  }

  function closeScreenSharePeer(peerId: string): void {
    clearScreenSharePeerTimer(peerId);
    const peer = ctx.peers.get(peerId);
    ctx.peers.delete(peerId);
    ctx.peerRoles.delete(peerId);
    ctx.stats.forgetPeerStats(peerId);
    ctx.pendingIce.delete(peerId);
    ctx.peerStreams.delete(peerId);
    try {
      peer?.close();
    } catch {
      /* closing an already closed peer is harmless */
    }
    if (!ctx.peers.size) ctx.stats.stopScreenShareStatsPolling();
  }

  function closeAllScreenSharePeers(): void {
    for (const peerId of [...ctx.peers.keys()]) closeScreenSharePeer(peerId);
  }

  function setScreenShareP2PError(message: LocalizedText = text("screenShareP2PFailed")) {
    ctx.errorCode.value = "";
    ctx.error.value = message;
  }

  function failScreenSharePeer(peerId: string, message?: LocalizedText): void {
    const viewingStream = ctx.streams.find((stream) => stream.streamId === ctx.viewingStreamId.value && stream.ownerPeerId === peerId);
    if (viewingStream) ctx.send({ type: "screenShareLeave", streamId: viewingStream.streamId });
    closeScreenSharePeer(peerId);
    if (viewingStream) {
      ctx.viewing.value = false;
      ctx.viewingStreamId.value = "";
      ctx.remoteStream.value = null;
    }
    setScreenShareP2PError(message);
  }

  function createScreenSharePeer(streamId: string, peerId: string, role: "owner" | "viewer"): RTCPeerConnection {
    const existing = ctx.peers.get(peerId);
    if (existing) return existing;
    // STUN discovers server-reflexive candidates, it does not carry media. TURN is only used when the deployment configures it,
    // and then it is that external service, not the WebSpeak gateway.
    const peer = new RTCPeerConnection({ iceServers: getScreenShareIceServers() });
    ctx.peers.set(peerId, peer);
    ctx.peerRoles.set(peerId, role);
    ctx.stats.startScreenShareStatsPolling();
    if (role === "owner") {
      const localStream = ctx.localStream();
      for (const track of localStream?.getTracks() ?? []) {
        const sender = peer.addTrack(track, localStream!);
        if (track.kind === "video") void configureScreenShareVideoSender(sender, track, ctx.outputSettings());
      }
    } else {
      peer.addTransceiver("video", { direction: "recvonly" });
      const stream = ctx.streams.find((candidate) => candidate.streamId === streamId);
      if (stream?.audio) peer.addTransceiver("audio", { direction: "recvonly" });
    }
    preferScreenShareCodecs(peer);
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate;
      ctx.send({
        type: "screenShareSignal",
        streamId,
        targetPeerId: peerId,
        signal: {
          kind: "iceCandidate",
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        },
      });
    };
    peer.ontrack = (event) => {
      if (role !== "viewer") return;
      clearScreenSharePeerTimer(peerId);
      const remote = event.streams[0] ?? ctx.peerStreams.get(peerId) ?? new MediaStream();
      if (!event.streams[0]) remote.addTrack(event.track);
      ctx.peerStreams.set(peerId, remote);
      ctx.remoteStream.value = remote;
      ctx.viewing.value = true;
    };
    peer.onconnectionstatechange = () => {
      // `completed` belongs to RTCIceConnectionState, not the aggregate RTCPeerConnection.connectionState. Treating it as a
      // connection state trips the type checker and can hide the failed/closed transitions we need.
      if (peer.connectionState === "connected") {
        clearScreenSharePeerTimer(peerId);
      } else if (peer.connectionState === "failed") {
        failScreenSharePeer(peerId);
      }
      if (peer.connectionState === "closed" && ctx.peers.get(peerId) === peer) closeScreenSharePeer(peerId);
    };
    return peer;
  }

  return {
    armScreenSharePeerTimer,
    closeScreenSharePeer,
    closeAllScreenSharePeers,
    setScreenShareP2PError,
    failScreenSharePeer,
    createScreenSharePeer,
  };
}
