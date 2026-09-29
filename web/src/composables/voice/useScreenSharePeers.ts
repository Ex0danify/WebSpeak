import { storeToRefs } from "pinia";
import { useVoiceScreenShareStore } from "../../stores/voiceScreenShare";
import { useVoiceSessionStore } from "../../stores/voiceSession";
import { SCREEN_SHARE_NEGOTIATION_TIMEOUT_MS, getScreenShareIceServers } from "./ice-servers";
import type {
  ScreenShareOutputSettings, ScreenShareSignal, ScreenShareStream, ScreenShareViewer,
} from "./types";
import type { MessageHandlers } from "./message-router";
import { useScreenShareStats } from "./useScreenShareStats";

/** Screen share: the peer connections and their negotiation timers, the offer/answer/ICE signalling,
 *  the per-peer statistics with their one-second poll, and the session (start, stop, join, leave and
 *  the stream list). Peers, streams, timers, pending candidates and the start bookkeeping are
 *  non-reactive closure state; only the refs the UI reads live in the store. */
export function useScreenSharePeers() {
  const { ws } = storeToRefs(useVoiceSessionStore());
  const screenShare = useVoiceScreenShareStore();
  const {
    screenShareActive, screenShareStarting, screenShareActiveStreamId, screenShareViewing, screenShareViewingStreamId, screenShareRemoteStream, screenShareError,
    screenShareErrorCode,
  } = storeToRefs(screenShare);
  const { screenShareStreams, screenShareWebRtcStats } = screenShare;
  const screenSharePeers = new Map<string, RTCPeerConnection>();
  const screenSharePeerRoles = new Map<string, "owner" | "viewer">();
  const screenSharePendingIce = new Map<string, RTCIceCandidateInit[]>();
  const screenSharePeerStreams = new Map<string, MediaStream>();
  const screenSharePeerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let screenShareLocalStream: MediaStream | null = null;
  // These are encoder/output limits. The display track itself must keep the
  // source resolution so selecting a high-resolution desktop or game window
  // never changes that source before capture.
  let screenShareOutputSettings: ScreenShareOutputSettings | null = null;
  let screenShareRequestSequence = 0;
  let screenSharePendingStartId = "";
  let screenShareStartCancelled = false;
  let screenShareStartGeneration = 0;
  const stats = useScreenShareStats({
    peers: screenSharePeers, peerRoles: screenSharePeerRoles, localStream: () => screenShareLocalStream,
  });

  function clearScreenSharePeerTimer(peerId: string): void {
    const timer = screenSharePeerTimers.get(peerId);
    if (!timer) return;
    clearTimeout(timer);
    screenSharePeerTimers.delete(peerId);
  }

  function armScreenSharePeerTimer(peerId: string): void {
    clearScreenSharePeerTimer(peerId);
    screenSharePeerTimers.set(peerId, setTimeout(() => {
      screenSharePeerTimers.delete(peerId);
      if (!screenSharePeers.has(peerId)) return;
      failScreenSharePeer(peerId, "屏幕共享直连协商超时，请确认双方网络允许浏览器直连");
    }, SCREEN_SHARE_NEGOTIATION_TIMEOUT_MS));
  }

  function closeScreenSharePeer(peerId: string): void {
    clearScreenSharePeerTimer(peerId);
    const peer = screenSharePeers.get(peerId);
    screenSharePeers.delete(peerId);
    screenSharePeerRoles.delete(peerId);
    stats.forgetPeerStats(peerId);
    screenSharePendingIce.delete(peerId);
    screenSharePeerStreams.delete(peerId);
    try { peer?.close(); } catch { /* closing an already closed peer is harmless */ }
    if (!screenSharePeers.size) stats.stopScreenShareStatsPolling();
  }

  function closeAllScreenSharePeers(): void {
    for (const peerId of [...screenSharePeers.keys()]) closeScreenSharePeer(peerId);
  }

  function setScreenShareP2PError(message = "直连 P2P 失败，当前网络无法建立浏览器之间的直接连接") {
    screenShareErrorCode.value = "";
    screenShareError.value = message;
  }

  function failScreenSharePeer(peerId: string, message?: string): void {
    const viewingStream = screenShareStreams.find((stream) => stream.streamId === screenShareViewingStreamId.value && stream.ownerPeerId === peerId);
    if (viewingStream) sendScreenShareMessage({ type: "screenShareLeave", streamId: viewingStream.streamId });
    closeScreenSharePeer(peerId);
    if (viewingStream) {
      screenShareViewing.value = false;
      screenShareViewingStreamId.value = "";
      screenShareRemoteStream.value = null;
    }
    setScreenShareP2PError(message);
  }

  function createScreenSharePeer(streamId: string, peerId: string, role: "owner" | "viewer"): RTCPeerConnection {
    const existing = screenSharePeers.get(peerId);
    if (existing) return existing;
    // STUN discovers server-reflexive candidates; it does not carry media.
    // TURN is accepted only when explicitly configured by the deployment, and
    // would use that external TURN service rather than the WebSpeak gateway.
    const peer = new RTCPeerConnection({ iceServers: getScreenShareIceServers() });
    screenSharePeers.set(peerId, peer);
    screenSharePeerRoles.set(peerId, role);
    stats.startScreenShareStatsPolling();
    if (role === "owner") {
      for (const track of screenShareLocalStream?.getTracks() ?? []) {
        const sender = peer.addTrack(track, screenShareLocalStream!);
        if (track.kind === "video") void configureScreenShareVideoSender(sender, track);
      }
    } else {
      peer.addTransceiver("video", { direction: "recvonly" });
      const stream = screenShareStreams.find((candidate) => candidate.streamId === streamId);
      if (stream?.audio) peer.addTransceiver("audio", { direction: "recvonly" });
    }
    preferScreenShareCodecs(peer);
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate;
      sendScreenShareMessage({
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
      const remote = event.streams[0] ?? screenSharePeerStreams.get(peerId) ?? new MediaStream();
      if (!event.streams[0]) remote.addTrack(event.track);
      screenSharePeerStreams.set(peerId, remote);
      screenShareRemoteStream.value = remote;
      screenShareViewing.value = true;
    };
    peer.onconnectionstatechange = () => {
      // `completed` belongs to RTCIceConnectionState, not the aggregate
      // RTCPeerConnection.connectionState. Treating it as a connection state
      // both trips the type checker and can hide the actual failed/closed
      // transitions we need to handle here.
      if (peer.connectionState === "connected") {
        clearScreenSharePeerTimer(peerId);
      } else if (peer.connectionState === "failed") {
        failScreenSharePeer(peerId);
      }
      if (peer.connectionState === "closed" && screenSharePeers.get(peerId) === peer) closeScreenSharePeer(peerId);
    };
    return peer;
  }

  async function configureScreenShareVideoSender(sender: RTCRtpSender, track: MediaStreamTrack): Promise<void> {
    if (!sender.setParameters || track.kind !== "video") return;
    try {
      const settings = track.getSettings();
      const requested = screenShareOutputSettings;
      const sourceWidth = typeof settings.width === "number" && settings.width > 0 ? settings.width : null;
      const sourceHeight = typeof settings.height === "number" && settings.height > 0 ? settings.height : null;
      const targetWidth = requested?.maxWidth ?? sourceWidth;
      const targetHeight = requested?.maxHeight ?? sourceHeight;
      const scaleResolutionDownBy = sourceWidth && sourceHeight && targetWidth && targetHeight
        ? Math.max(1, sourceWidth / targetWidth, sourceHeight / targetHeight)
        : 1;
      const sourceFrameRate = typeof settings.frameRate === "number" && settings.frameRate > 0 ? settings.frameRate : null;
      const targetFrameRate = requested?.maxFrameRate
        ? Math.max(1, Math.min(requested.maxFrameRate, sourceFrameRate ?? requested.maxFrameRate))
        : sourceFrameRate;
      const parameters = sender.getParameters();
      const encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      const firstEncoding = { ...encodings[0] };
      if (scaleResolutionDownBy > 1.01) firstEncoding.scaleResolutionDownBy = scaleResolutionDownBy;
      if (targetFrameRate) firstEncoding.maxFramerate = targetFrameRate;
      parameters.encodings = [firstEncoding, ...encodings.slice(1)];
      // Prefer keeping motion smooth and let the encoder reduce detail/resolution
      // before it throws away large numbers of frames under pressure.
      parameters.degradationPreference = "maintain-framerate";
      await sender.setParameters(parameters);
    } catch {
      // Older browsers may reject one of the optional sender parameters. The
      // track remains usable and the diagnostics panel still exposes the real
      // negotiated frame rate and dimensions.
    }
  }

  function preferScreenShareCodecs(peer: RTCPeerConnection): void {
    const transceiver = peer.getTransceivers().find((candidate) => candidate.sender.track?.kind === "video" || candidate.receiver.track?.kind === "video");
    const capabilities = typeof RTCRtpReceiver !== "undefined" ? RTCRtpReceiver.getCapabilities?.("video") : null;
    if (!transceiver?.setCodecPreferences || !capabilities?.codecs?.length) return;
    const vp8 = capabilities.codecs.filter((codec) => codec.mimeType.toLowerCase() === "video/vp8");
    if (!vp8.length) return;
    const remaining = capabilities.codecs.filter((codec) => codec.mimeType.toLowerCase() !== "video/vp8");
    try { transceiver.setCodecPreferences([...vp8, ...remaining]); } catch { /* older browsers may reject codec preference changes */ }
  }

  async function flushScreenShareCandidates(peerId: string, peer: RTCPeerConnection): Promise<void> {
    const pending = screenSharePendingIce.get(peerId) ?? [];
    screenSharePendingIce.delete(peerId);
    for (const candidate of pending) {
      try { await peer.addIceCandidate(candidate); } catch { /* an obsolete candidate can be ignored */ }
    }
  }

  async function startScreenShareViewer(stream: ScreenShareStream): Promise<void> {
    closeAllScreenSharePeers();
    screenShareRemoteStream.value = null;
    screenShareViewing.value = true;
    screenShareViewingStreamId.value = stream.streamId;
    screenShareErrorCode.value = "";
    screenShareError.value = "";
    const peer = createScreenSharePeer(stream.streamId, stream.ownerPeerId, "viewer");
    if (stream.source === "teamspeak") {
      armScreenSharePeerTimer(stream.ownerPeerId);
      return;
    }
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      armScreenSharePeerTimer(stream.ownerPeerId);
      sendScreenShareMessage({
        type: "screenShareSignal",
        streamId: stream.streamId,
        targetPeerId: stream.ownerPeerId,
        signal: { kind: "offer", sdp: peer.localDescription?.sdp ?? offer.sdp ?? "" },
      });
    } catch {
      failScreenSharePeer(stream.ownerPeerId, "无法创建屏幕共享直连请求，请重试");
    }
  }

  async function startNativeScreenShareViewer(streamId: string, peerId: string): Promise<void> {
    const stream = screenShareStreams.find((candidate) => candidate.streamId === streamId);
    if (!stream || stream.source !== "browser" || screenShareActiveStreamId.value !== streamId || stream.ownerPeerId !== screenShareLocalPeerId()) return;
    closeScreenSharePeer(peerId);
    const peer = createScreenSharePeer(streamId, peerId, "owner");
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      armScreenSharePeerTimer(peerId);
      sendScreenShareMessage({
        type: "screenShareSignal",
        streamId,
        targetPeerId: peerId,
        signal: { kind: "offer", sdp: peer.localDescription?.sdp ?? offer.sdp ?? "" },
      });
    } catch {
      failScreenSharePeer(peerId, "无法为 TeamSpeak 观看端创建屏幕共享直连");
    }
  }

  async function handleScreenShareSignal(streamId: string, fromPeerId: string, signal: ScreenShareSignal): Promise<void> {
    const stream = screenShareStreams.find((candidate) => candidate.streamId === streamId);
    if (!stream) return;
    if (signal.kind === "close") {
      closeScreenSharePeer(fromPeerId);
      if (screenShareViewingStreamId.value === streamId) {
        screenShareViewing.value = false;
        screenShareViewingStreamId.value = "";
        screenShareRemoteStream.value = null;
      }
      return;
    }
    if (signal.kind === "iceCandidate") {
      if (!signal.candidate) return;
      const peer = screenSharePeers.get(fromPeerId);
      const candidate: RTCIceCandidateInit = {
        candidate: signal.candidate,
        ...(signal.sdpMid !== undefined ? { sdpMid: signal.sdpMid } : {}),
        ...(signal.sdpMLineIndex !== undefined ? { sdpMLineIndex: signal.sdpMLineIndex } : {}),
      };
      if (!peer?.remoteDescription) {
        screenSharePendingIce.set(fromPeerId, [...(screenSharePendingIce.get(fromPeerId) ?? []), candidate]);
        return;
      }
      try { await peer.addIceCandidate(candidate); } catch { /* stale ICE is not fatal */ }
      return;
    }

    if (stream.source === "teamspeak" && screenShareViewingStreamId.value === streamId && fromPeerId === stream.ownerPeerId && signal.kind === "offer") {
      const peer = screenSharePeers.get(fromPeerId) ?? createScreenSharePeer(streamId, fromPeerId, "viewer");
      if (!signal.sdp) return;
      armScreenSharePeerTimer(fromPeerId);
      try {
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await flushScreenShareCandidates(fromPeerId, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendScreenShareMessage({ type: "screenShareSignal", streamId, targetPeerId: fromPeerId, signal: { kind: "answer", sdp: answer.sdp ?? "" } });
      } catch {
        failScreenSharePeer(fromPeerId, "无法回复 TeamSpeak 屏幕共享的直连请求");
      }
      return;
    }

    if (stream.source === "browser" && screenShareActiveStreamId.value === streamId && stream.ownerPeerId === screenShareLocalPeerId() && fromPeerId.startsWith("ts-viewer-") && signal.kind === "answer") {
      const peer = screenSharePeers.get(fromPeerId);
      if (!peer || !signal.sdp) return;
      try {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await flushScreenShareCandidates(fromPeerId, peer);
      } catch {
        failScreenSharePeer(fromPeerId, "TeamSpeak 观看端无法完成屏幕共享直连协商");
      }
      return;
    }

    if (stream.source === "browser" && stream.ownerPeerId === fromPeerId && signal.kind === "answer") {
      const peer = screenSharePeers.get(fromPeerId);
      if (!peer || !signal.sdp) return;
      try {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await flushScreenShareCandidates(fromPeerId, peer);
      } catch {
        failScreenSharePeer(fromPeerId, "观看端无法完成屏幕共享直连协商");
      }
      return;
    }

    if (screenShareActiveStreamId.value === streamId && stream.ownerPeerId === screenShareLocalPeerId()) {
      const peer = screenSharePeers.get(fromPeerId) ?? createScreenSharePeer(streamId, fromPeerId, "owner");
      if (signal.kind !== "offer" || !signal.sdp) return;
      armScreenSharePeerTimer(fromPeerId);
      try {
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await flushScreenShareCandidates(fromPeerId, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendScreenShareMessage({ type: "screenShareSignal", streamId, targetPeerId: fromPeerId, signal: { kind: "answer", sdp: answer.sdp ?? "" } });
      } catch {
        setScreenShareP2PError("共享端无法完成观看者的直连协商");
      }
    }
  }


  function sendScreenShareMessage(message: Record<string, unknown>): void {
    if (ws.value?.readyState === WebSocket.OPEN) ws.value.send(JSON.stringify(message));
  }

  // The owner peer id is generated by the gateway and is returned in the
  // screenShareStarted event; the active stream's owner id is therefore the
  // only stable local-owner marker available to the browser.
  function screenShareLocalPeerId(): string {
    const active = screenShareStreams.find((stream) => stream.streamId === screenShareActiveStreamId.value);
    return active?.ownerPeerId ?? "";
  }

  async function startScreenShare(audio = true, settings?: ScreenShareOutputSettings): Promise<void> {
    if (ws.value?.readyState !== WebSocket.OPEN || screenShareActive.value || screenShareStarting.value) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      screenShareError.value = "当前浏览器不支持屏幕共享";
      return;
    }
    screenShareErrorCode.value = "";
    screenShareError.value = "";
    const startGeneration = ++screenShareStartGeneration;
    screenShareStarting.value = true;
    screenShareStartCancelled = false;
    screenShareOutputSettings = settings ?? null;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // Capture the selected surface at its native browser-provided size.
        // Output resolution/FPS are applied later on each RTCRtpSender so the
        // user's desktop or application window is never resized or sampled at
        // the output limit.
        video: true,
        audio,
        // These are preferences: when the selected surface is a window, ask
        // for that window's audio; when it is a monitor, allow system audio.
        // The browser/OS may still return no audio or ignore the preference.
        systemAudio: "include",
        windowAudio: "window",
        selfBrowserSurface: "exclude",
      } as unknown as DisplayMediaStreamOptions);
      if (startGeneration !== screenShareStartGeneration || !screenShareStarting.value || screenShareStartCancelled) {
        stream.getTracks().forEach((track) => track.stop());
        screenShareOutputSettings = null;
        return;
      }
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("NO_VIDEO_TRACK");
      const displaySurface = videoTrack.getSettings().displaySurface;
      if ("contentHint" in videoTrack) videoTrack.contentHint = displaySurface === "browser" ? "detail" : "motion";
      screenShareLocalStream = stream;
      screenShareRequestSequence = (screenShareRequestSequence + 1) % 1_000_000;
      screenSharePendingStartId = `screen-start-${screenShareRequestSequence}`;
      for (const track of stream.getTracks()) track.addEventListener("ended", () => { void stopScreenShare(); }, { once: true });
      sendScreenShareMessage({ type: "screenShareStart", requestId: screenSharePendingStartId, audio: stream.getAudioTracks().length > 0, name: "我的屏幕" });
    } catch (error: unknown) {
      if (startGeneration !== screenShareStartGeneration) return;
      screenShareLocalStream?.getTracks().forEach((track) => track.stop());
      screenShareLocalStream = null;
      screenShareOutputSettings = null;
      screenShareStarting.value = false;
      screenSharePendingStartId = "";
      screenShareStartCancelled = false;
      if (error instanceof DOMException && error.name === "NotAllowedError") screenShareError.value = "你取消了屏幕共享或浏览器未授予权限";
      else screenShareError.value = "无法开始屏幕共享，请检查浏览器权限";
    }
  }

  function stopScreenShare(): void {
    screenShareStartGeneration += 1;
    if (screenShareStarting.value) screenShareStartCancelled = true;
    if (screenShareActive.value && screenShareActiveStreamId.value) sendScreenShareMessage({ type: "screenShareStop", streamId: screenShareActiveStreamId.value });
    closeAllScreenSharePeers();
    screenShareLocalStream?.getTracks().forEach((track) => track.stop());
    screenShareLocalStream = null;
    screenShareOutputSettings = null;
    screenShareStarting.value = false;
    screenSharePendingStartId = "";
    screenShareStartCancelled = false;
    screenShareActive.value = false;
    screenShareActiveStreamId.value = "";
  }

  function joinScreenShare(streamId: string): void {
    screenShareErrorCode.value = "";
    screenShareError.value = "";
    if (screenShareViewingStreamId.value && screenShareViewingStreamId.value !== streamId) leaveScreenShare();
    screenShareRequestSequence = (screenShareRequestSequence + 1) % 1_000_000;
    sendScreenShareMessage({ type: "screenShareJoin", streamId, requestId: `screen-join-${screenShareRequestSequence}` });
  }

  function leaveScreenShare(): void {
    if (screenShareViewingStreamId.value) sendScreenShareMessage({ type: "screenShareLeave", streamId: screenShareViewingStreamId.value });
    closeAllScreenSharePeers();
    screenShareViewing.value = false;
    screenShareViewingStreamId.value = "";
    screenShareRemoteStream.value = null;
  }

  function stopScreenShareTransport(sendStop: boolean): void {
    screenShareStartGeneration += 1;
    if (sendStop && screenShareActive.value && screenShareActiveStreamId.value) sendScreenShareMessage({ type: "screenShareStop", streamId: screenShareActiveStreamId.value });
    if (screenShareStarting.value) screenShareStartCancelled = true;
    closeAllScreenSharePeers();
    screenShareLocalStream?.getTracks().forEach((track) => track.stop());
    screenShareLocalStream = null;
    screenShareOutputSettings = null;
    screenShareStarting.value = false;
    screenSharePendingStartId = "";
    screenShareStartCancelled = false;
    screenShareActive.value = false;
    screenShareActiveStreamId.value = "";
    screenShareViewing.value = false;
    screenShareViewingStreamId.value = "";
    screenShareRemoteStream.value = null;
    screenShareStreams.length = 0;
  }

  function upsertScreenShareStream(raw: unknown): ScreenShareStream | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Partial<ScreenShareStream>;
    if (typeof value.streamId !== "string" || typeof value.ownerPeerId !== "string") return null;
    const stream: ScreenShareStream = {
      streamId: value.streamId,
      source: value.source === "teamspeak" ? "teamspeak" : "browser",
      ownerPeerId: value.ownerPeerId,
      ...(typeof value.ownerClientId === "number" ? { ownerClientId: value.ownerClientId } : {}),
      ownerNickname: typeof value.ownerNickname === "string" ? value.ownerNickname : "TeamSpeak 用户",
      name: typeof value.name === "string" ? value.name : "屏幕共享",
      audio: value.audio === true,
      createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
      viewerCount: typeof value.viewerCount === "number" ? value.viewerCount : 0,
      viewers: normalizeScreenShareViewers(value.viewers),
    };
    const index = screenShareStreams.findIndex((candidate) => candidate.streamId === stream.streamId);
    if (index >= 0) screenShareStreams.splice(index, 1, stream);
    else screenShareStreams.push(stream);
    return stream;
  }

  function normalizeScreenShareViewers(raw: unknown): ScreenShareViewer[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((viewer): viewer is ScreenShareViewer => Boolean(viewer) && typeof viewer === "object" && typeof (viewer as ScreenShareViewer).peerId === "string" && typeof (viewer as ScreenShareViewer).nickname === "string")
      .slice(0, 64)
      .map((viewer) => ({
        peerId: viewer.peerId.slice(0, 128),
        nickname: viewer.nickname.slice(0, 120),
        ...(typeof viewer.avatar === "string" && viewer.avatar.length <= 128 * 1024 ? { avatar: viewer.avatar } : {}),
      }));
  }

  /** Router seam until Step V6.2: the pending-start check of `screenShareStarted`, verbatim. */
  function consumePendingStart(requestId: string): boolean {
    const isCurrentStart = Boolean(screenSharePendingStartId) && requestId === screenSharePendingStartId && !screenShareStartCancelled;
    screenSharePendingStartId = "";
    return isCurrentStart;
  }

  /** Router seam until Step V6.2: forget the pending start (two lines the router repeated). */
  function clearPendingStart(): void {
    screenSharePendingStartId = "";
    screenShareStartCancelled = false;
  }

  /** Router seam until Step V6.2: release the display capture (three lines the router repeated). */
  function releaseCapture(): void {
    screenShareLocalStream?.getTracks().forEach((track) => track.stop());
    screenShareLocalStream = null;
    screenShareOutputSettings = null;
  }

  const handlers: MessageHandlers = {
    screenShareList: (msg: any) => {
      screenShareStreams.length = 0;
      if (Array.isArray(msg.streams)) for (const raw of msg.streams) upsertScreenShareStream(raw);
    },
    screenShareStarted: (msg: any) => {
      const stream = upsertScreenShareStream(msg.stream);
      if (!stream) return;
      if (msg.owner === true) {
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        const isCurrentStart = consumePendingStart(requestId);
        screenShareStarting.value = false;
        if (!isCurrentStart) {
          sendScreenShareMessage({ type: "screenShareStop", streamId: stream.streamId });
          releaseCapture();
          const staleIndex = screenShareStreams.findIndex((candidate) => candidate.streamId === stream.streamId);
          if (staleIndex >= 0) screenShareStreams.splice(staleIndex, 1);
          return;
        }
        screenShareActive.value = true;
        screenShareActiveStreamId.value = stream.streamId;
      }
    },
    screenShareViewerCount: (msg: any) => {
      const stream = screenShareStreams.find((candidate) => candidate.streamId === String(msg.streamId || ""));
      if (stream) {
        if (typeof msg.viewerCount === "number") stream.viewerCount = Math.max(0, Math.floor(msg.viewerCount));
        if (Array.isArray(msg.viewers)) stream.viewers = normalizeScreenShareViewers(msg.viewers);
      }
    },
    screenShareStopped: (msg: any) => {
      const streamId = String(msg.streamId || "");
      const index = screenShareStreams.findIndex((candidate) => candidate.streamId === streamId);
      if (index >= 0) screenShareStreams.splice(index, 1);
      if (screenShareActiveStreamId.value === streamId) {
        closeAllScreenSharePeers();
        screenShareStarting.value = false;
        clearPendingStart();
        screenShareActive.value = false;
        screenShareActiveStreamId.value = "";
        releaseCapture();
      }
      if (screenShareViewingStreamId.value === streamId) {
        closeAllScreenSharePeers();
        screenShareViewing.value = false;
        screenShareViewingStreamId.value = "";
        screenShareRemoteStream.value = null;
      }
    },
    screenShareJoined: (msg: any) => {
      const stream = upsertScreenShareStream(msg.stream);
      if (!stream) return;
      void startScreenShareViewer(stream);
    },
    screenShareNativeViewerJoined: (msg: any) => {
      if (typeof msg.streamId === "string" && typeof msg.viewerPeerId === "string") {
        void startNativeScreenShareViewer(msg.streamId, msg.viewerPeerId);
      }
    },
    screenShareSignal: (msg: any) => {
      if (typeof msg.streamId === "string" && typeof msg.fromPeerId === "string" && msg.signal) {
        void handleScreenShareSignal(msg.streamId, msg.fromPeerId, msg.signal as ScreenShareSignal);
      }
    },
    screenShareViewerLeft: (msg: any) => {
      if (typeof msg.viewerPeerId === "string") closeScreenSharePeer(msg.viewerPeerId);
    },
    screenShareLeft: (msg: any) => {
      if (screenShareViewingStreamId.value === String(msg.streamId || "")) leaveScreenShare();
    },
    screenShareError: (msg: any) => {
      screenShareErrorCode.value = typeof msg.code === "string" ? msg.code : "";
      screenShareError.value = String(msg.message || "屏幕共享操作失败");
      if (screenShareStarting.value) {
        screenShareStarting.value = false;
        clearPendingStart();
        releaseCapture();
      }
      if (screenShareViewing.value) {
        if (screenShareViewingStreamId.value) sendScreenShareMessage({ type: "screenShareLeave", streamId: screenShareViewingStreamId.value });
        closeAllScreenSharePeers();
        screenShareViewing.value = false;
        screenShareViewingStreamId.value = "";
        screenShareRemoteStream.value = null;
      }
    },
  };

  return {
    handlers,
    startScreenShareStatsPolling: stats.startScreenShareStatsPolling, stopScreenShareStatsPolling: stats.stopScreenShareStatsPolling, closeScreenSharePeer, closeAllScreenSharePeers,
    startScreenShareViewer, startNativeScreenShareViewer, handleScreenShareSignal,
    startScreenShare, stopScreenShare, joinScreenShare, leaveScreenShare, stopScreenShareTransport, upsertScreenShareStream,
    normalizeScreenShareViewers, sendScreenShareMessage, consumePendingStart, clearPendingStart, releaseCapture,
  };
}
