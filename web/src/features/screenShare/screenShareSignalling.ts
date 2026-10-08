import type { Ref } from "vue";
import { text } from "@/shared/i18n/localizedText";
import type { ScreenShareSignal, ScreenShareStream } from "./screenShareTypes";
import type { ScreenSharePeerContext, createScreenSharePeerLifecycle } from "./screenSharePeerLifecycle";

export interface ScreenShareSignallingContext extends ScreenSharePeerContext {
  lifecycle: ReturnType<typeof createScreenSharePeerLifecycle>;
  activeStreamId: Ref<string>;
  localPeerId: () => string;
}

/** Offer/answer/ICE signalling on the peers the lifecycle owns: the viewer and native-viewer offers,
 *  incoming signals and the pending-candidate flush. */
export function createScreenShareSignalling(ctx: ScreenShareSignallingContext) {
  const {
    armScreenSharePeerTimer, closeScreenSharePeer, closeAllScreenSharePeers, setScreenShareP2PError,
    failScreenSharePeer, createScreenSharePeer,
  } = ctx.lifecycle;

  async function flushScreenShareCandidates(peerId: string, peer: RTCPeerConnection): Promise<void> {
    const pending = ctx.pendingIce.get(peerId) ?? [];
    ctx.pendingIce.delete(peerId);
    for (const candidate of pending) {
      try { await peer.addIceCandidate(candidate); } catch { /* an obsolete candidate can be ignored */ }
    }
  }

  async function startScreenShareViewer(stream: ScreenShareStream): Promise<void> {
    closeAllScreenSharePeers();
    ctx.remoteStream.value = null;
    ctx.viewing.value = true;
    ctx.viewingStreamId.value = stream.streamId;
    ctx.errorCode.value = "";
    ctx.error.value = "";
    const peer = createScreenSharePeer(stream.streamId, stream.ownerPeerId, "viewer");
    if (stream.source === "teamspeak") {
      armScreenSharePeerTimer(stream.ownerPeerId);
      return;
    }
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      armScreenSharePeerTimer(stream.ownerPeerId);
      ctx.send({
        type: "screenShareSignal",
        streamId: stream.streamId,
        targetPeerId: stream.ownerPeerId,
        signal: { kind: "offer", sdp: peer.localDescription?.sdp ?? offer.sdp ?? "" },
      });
    } catch {
      failScreenSharePeer(stream.ownerPeerId, text("screenShareP2POfferFailed"));
    }
  }

  async function startNativeScreenShareViewer(streamId: string, peerId: string): Promise<void> {
    const stream = ctx.streams.find((candidate) => candidate.streamId === streamId);
    if (!stream || stream.source !== "browser" || ctx.activeStreamId.value !== streamId || stream.ownerPeerId !== ctx.localPeerId()) return;
    closeScreenSharePeer(peerId);
    const peer = createScreenSharePeer(streamId, peerId, "owner");
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      armScreenSharePeerTimer(peerId);
      ctx.send({
        type: "screenShareSignal",
        streamId,
        targetPeerId: peerId,
        signal: { kind: "offer", sdp: peer.localDescription?.sdp ?? offer.sdp ?? "" },
      });
    } catch {
      failScreenSharePeer(peerId, text("screenShareP2PTsViewerFailed"));
    }
  }

  async function handleScreenShareSignal(streamId: string, fromPeerId: string, signal: ScreenShareSignal): Promise<void> {
    const stream = ctx.streams.find((candidate) => candidate.streamId === streamId);
    if (!stream) return;
    if (signal.kind === "close") {
      closeScreenSharePeer(fromPeerId);
      if (ctx.viewingStreamId.value === streamId) {
        ctx.viewing.value = false;
        ctx.viewingStreamId.value = "";
        ctx.remoteStream.value = null;
      }
      return;
    }
    if (signal.kind === "iceCandidate") {
      if (!signal.candidate) return;
      const peer = ctx.peers.get(fromPeerId);
      const candidate: RTCIceCandidateInit = {
        candidate: signal.candidate,
        ...(signal.sdpMid !== undefined ? { sdpMid: signal.sdpMid } : {}),
        ...(signal.sdpMLineIndex !== undefined ? { sdpMLineIndex: signal.sdpMLineIndex } : {}),
      };
      if (!peer?.remoteDescription) {
        ctx.pendingIce.set(fromPeerId, [...(ctx.pendingIce.get(fromPeerId) ?? []), candidate]);
        return;
      }
      try { await peer.addIceCandidate(candidate); } catch { /* stale ICE is not fatal */ }
      return;
    }

    if (stream.source === "teamspeak" && ctx.viewingStreamId.value === streamId && fromPeerId === stream.ownerPeerId && signal.kind === "offer") {
      const peer = ctx.peers.get(fromPeerId) ?? createScreenSharePeer(streamId, fromPeerId, "viewer");
      if (!signal.sdp) return;
      armScreenSharePeerTimer(fromPeerId);
      try {
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await flushScreenShareCandidates(fromPeerId, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        ctx.send({ type: "screenShareSignal", streamId, targetPeerId: fromPeerId, signal: { kind: "answer", sdp: answer.sdp ?? "" } });
      } catch {
        failScreenSharePeer(fromPeerId, text("screenShareP2PTsAnswerFailed"));
      }
      return;
    }

    if (stream.source === "browser" && ctx.activeStreamId.value === streamId && stream.ownerPeerId === ctx.localPeerId() && fromPeerId.startsWith("ts-viewer-") && signal.kind === "answer") {
      const peer = ctx.peers.get(fromPeerId);
      if (!peer || !signal.sdp) return;
      try {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await flushScreenShareCandidates(fromPeerId, peer);
      } catch {
        failScreenSharePeer(fromPeerId, text("screenShareP2PTsNegotiationFailed"));
      }
      return;
    }

    if (stream.source === "browser" && stream.ownerPeerId === fromPeerId && signal.kind === "answer") {
      const peer = ctx.peers.get(fromPeerId);
      if (!peer || !signal.sdp) return;
      try {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await flushScreenShareCandidates(fromPeerId, peer);
      } catch {
        failScreenSharePeer(fromPeerId, text("screenShareP2PViewerNegotiationFailed"));
      }
      return;
    }

    if (ctx.activeStreamId.value === streamId && stream.ownerPeerId === ctx.localPeerId()) {
      const peer = ctx.peers.get(fromPeerId) ?? createScreenSharePeer(streamId, fromPeerId, "owner");
      if (signal.kind !== "offer" || !signal.sdp) return;
      armScreenSharePeerTimer(fromPeerId);
      try {
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await flushScreenShareCandidates(fromPeerId, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        ctx.send({ type: "screenShareSignal", streamId, targetPeerId: fromPeerId, signal: { kind: "answer", sdp: answer.sdp ?? "" } });
      } catch {
        setScreenShareP2PError(text("screenShareP2POwnerNegotiationFailed"));
      }
    }
  }

  return { startScreenShareViewer, startNativeScreenShareViewer, handleScreenShareSignal };
}
