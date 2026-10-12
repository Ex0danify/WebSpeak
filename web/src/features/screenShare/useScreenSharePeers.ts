import { storeToRefs } from "pinia";
import { text } from "@/shared/i18n/localizedText";
import { screenShareErrorMessage } from "./screenShareErrors";
import { useScreenShareStore } from "./stores/screenShareStore";
import { useSessionStore } from "@/features/session";
import type { ScreenShareOutputSettings, ScreenShareSignal, ScreenShareStream } from "./screenShareTypes";
import type { MessageHandlers } from "@/features/session";
import { useScreenShareStats } from "./useScreenShareStats";
import { createScreenSharePeerLifecycle } from "./screenSharePeerLifecycle";
import { createScreenShareSignalling } from "./screenShareSignalling";
import { normalizeScreenShareViewers, parseScreenShareStream } from "./screenShareStreams";

/** Screen share peers: connections and negotiation timers, offer/answer/ICE signalling, per-peer stats (polled every second)
 *  and the session (start, stop, join, leave, stream list). Everything but the refs the UI reads is non-reactive closure state. */
export function useScreenSharePeers() {
  const { ws } = storeToRefs(useSessionStore());
  const screenShare = useScreenShareStore();
  const {
    screenShareActive,
    screenShareStarting,
    screenShareActiveStreamId,
    screenShareViewing,
    screenShareViewingStreamId,
    screenShareRemoteStream,
    screenShareError,
    screenShareErrorCode,
  } = storeToRefs(screenShare);
  const { screenShareStreams } = screenShare;
  const screenSharePeers = new Map<string, RTCPeerConnection>();
  const screenSharePeerRoles = new Map<string, "owner" | "viewer">();
  const screenSharePendingIce = new Map<string, RTCIceCandidateInit[]>();
  const screenSharePeerStreams = new Map<string, MediaStream>();
  let screenShareLocalStream: MediaStream | null = null;
  // Encoder/output limits only. The display track keeps the source resolution so a high-resolution desktop or game window
  // is never changed before capture.
  let screenShareOutputSettings: ScreenShareOutputSettings | null = null;
  let screenShareRequestSequence = 0;
  let screenSharePendingStartId = "";
  let screenShareStartGeneration = 0;
  const stats = useScreenShareStats({
    peers: screenSharePeers,
    peerRoles: screenSharePeerRoles,
    localStream: () => screenShareLocalStream,
  });

  const peerContext = {
    peers: screenSharePeers,
    peerRoles: screenSharePeerRoles,
    pendingIce: screenSharePendingIce,
    peerStreams: screenSharePeerStreams,
    stats,
    streams: screenShareStreams,
    viewing: screenShareViewing,
    viewingStreamId: screenShareViewingStreamId,
    remoteStream: screenShareRemoteStream,
    error: screenShareError,
    errorCode: screenShareErrorCode,
    send: sendScreenShareMessage,
    localStream: () => screenShareLocalStream,
    outputSettings: () => screenShareOutputSettings,
  };
  const lifecycle = createScreenSharePeerLifecycle(peerContext);
  const { closeScreenSharePeer, closeAllScreenSharePeers } = lifecycle;
  const { startScreenShareViewer, startNativeScreenShareViewer, handleScreenShareSignal } = createScreenShareSignalling({
    ...peerContext,
    lifecycle,
    activeStreamId: screenShareActiveStreamId,
  });

  function sendScreenShareMessage(message: Record<string, unknown>): void {
    if (ws.value?.readyState === WebSocket.OPEN) ws.value.send(JSON.stringify(message));
  }

  // The owner peer id comes from the gateway in screenShareStarted, so the active stream's owner id is the only stable
  // local-owner marker the browser has.
  async function startScreenShare(audio = true, settings?: ScreenShareOutputSettings): Promise<void> {
    if (ws.value?.readyState !== WebSocket.OPEN || screenShareActive.value || screenShareStarting.value) return;
    screenShareErrorCode.value = "";
    screenShareError.value = "";
    if (!navigator.mediaDevices?.getDisplayMedia) {
      screenShareError.value = text("screenShareUnsupported");
      return;
    }
    const startGeneration = ++screenShareStartGeneration;
    screenShareStarting.value = true;
    screenShareOutputSettings = settings ?? null;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // Capture at the surface's native size. Output resolution and FPS are applied later on each RTCRtpSender, so the
        // user's window is never resized or sampled at the output limit.
        video: true,
        audio,
        // Only preferences, ask for a window's audio when sharing a window and allow system audio for a monitor. The
        // browser or OS may still return no audio.
        systemAudio: "include",
        windowAudio: "window",
        selfBrowserSurface: "exclude",
      } as unknown as DisplayMediaStreamOptions);
      if (startGeneration !== screenShareStartGeneration || !screenShareStarting.value) {
        stream.getTracks().forEach((track) => track.stop());
        screenShareOutputSettings = null;
        return;
      }
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("NO_VIDEO_TRACK");
      }
      const displaySurface = videoTrack.getSettings().displaySurface;
      if ("contentHint" in videoTrack) videoTrack.contentHint = displaySurface === "browser" ? "detail" : "motion";
      screenShareLocalStream = stream;
      screenShareRequestSequence = (screenShareRequestSequence + 1) % 1_000_000;
      screenSharePendingStartId = `screen-start-${screenShareRequestSequence}`;
      for (const track of stream.getTracks())
        track.addEventListener(
          "ended",
          () => {
            void stopScreenShare();
          },
          { once: true },
        );
      sendScreenShareMessage({ type: "screenShareStart", requestId: screenSharePendingStartId, audio: stream.getAudioTracks().length > 0 });
    } catch (error: unknown) {
      if (startGeneration !== screenShareStartGeneration) return;
      screenShareLocalStream?.getTracks().forEach((track) => track.stop());
      screenShareLocalStream = null;
      screenShareOutputSettings = null;
      screenShareStarting.value = false;
      screenSharePendingStartId = "";
      if (error instanceof DOMException && error.name === "NotAllowedError") screenShareError.value = text("screenSharePermissionDenied");
      else screenShareError.value = text("screenShareStartFailed");
    }
  }

  function stopScreenShare(): void {
    screenShareStartGeneration += 1;
    if (screenShareActive.value && screenShareActiveStreamId.value)
      sendScreenShareMessage({ type: "screenShareStop", streamId: screenShareActiveStreamId.value });
    closeAllScreenSharePeers();
    screenShareLocalStream?.getTracks().forEach((track) => track.stop());
    screenShareLocalStream = null;
    screenShareOutputSettings = null;
    screenShareStarting.value = false;
    screenSharePendingStartId = "";
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
    if (sendStop && screenShareActive.value && screenShareActiveStreamId.value)
      sendScreenShareMessage({ type: "screenShareStop", streamId: screenShareActiveStreamId.value });
    closeAllScreenSharePeers();
    screenShareLocalStream?.getTracks().forEach((track) => track.stop());
    screenShareLocalStream = null;
    screenShareOutputSettings = null;
    screenShareStarting.value = false;
    screenSharePendingStartId = "";
    screenShareActive.value = false;
    screenShareActiveStreamId.value = "";
    screenShareViewing.value = false;
    screenShareViewingStreamId.value = "";
    screenShareRemoteStream.value = null;
    screenShareStreams.length = 0;
  }

  function upsertScreenShareStream(raw: unknown): ScreenShareStream | null {
    const stream = parseScreenShareStream(raw);
    if (!stream) return null;
    const index = screenShareStreams.findIndex((candidate) => candidate.streamId === stream.streamId);
    if (index >= 0) screenShareStreams.splice(index, 1, stream);
    else screenShareStreams.push(stream);
    return stream;
  }

  function consumePendingStart(requestId: string): boolean {
    const isCurrentStart = Boolean(screenSharePendingStartId) && requestId === screenSharePendingStartId;
    screenSharePendingStartId = "";
    return isCurrentStart;
  }

  function clearPendingStart(): void {
    screenSharePendingStartId = "";
  }

  function releaseCapture(): void {
    screenShareLocalStream?.getTracks().forEach((track) => track.stop());
    screenShareLocalStream = null;
    screenShareOutputSettings = null;
  }

  const handlers: MessageHandlers = {
    screenShareList: (msg) => {
      screenShareStreams.length = 0;
      if (Array.isArray(msg.streams)) for (const raw of msg.streams) upsertScreenShareStream(raw);
    },
    screenShareStarted: (msg) => {
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
    screenShareViewerCount: (msg) => {
      const stream = screenShareStreams.find((candidate) => candidate.streamId === String(msg.streamId || ""));
      if (stream) {
        if (typeof msg.viewerCount === "number") stream.viewerCount = Math.max(0, Math.floor(msg.viewerCount));
        if (Array.isArray(msg.viewers)) stream.viewers = normalizeScreenShareViewers(msg.viewers);
      }
    },
    screenShareStopped: (msg) => {
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
    screenShareJoined: (msg) => {
      const stream = upsertScreenShareStream(msg.stream);
      if (!stream) return;
      void startScreenShareViewer(stream);
    },
    screenShareNativeViewerJoined: (msg) => {
      if (typeof msg.streamId === "string" && typeof msg.viewerPeerId === "string") {
        void startNativeScreenShareViewer(msg.streamId, msg.viewerPeerId);
      }
    },
    screenShareSignal: (msg) => {
      if (typeof msg.streamId === "string" && typeof msg.fromPeerId === "string" && msg.signal) {
        void handleScreenShareSignal(msg.streamId, msg.fromPeerId, msg.signal as ScreenShareSignal);
      }
    },
    screenShareViewerLeft: (msg) => {
      if (typeof msg.viewerPeerId === "string") closeScreenSharePeer(msg.viewerPeerId);
    },
    screenShareLeft: (msg) => {
      if (screenShareViewingStreamId.value === String(msg.streamId || "")) leaveScreenShare();
    },
    screenShareError: (msg) => {
      screenShareErrorCode.value = typeof msg.code === "string" ? msg.code : "";
      screenShareError.value = screenShareErrorMessage(screenShareErrorCode.value, msg.params);
      if (screenShareStarting.value) {
        screenShareStarting.value = false;
        clearPendingStart();
        releaseCapture();
      }
      if (screenShareViewing.value) {
        if (screenShareViewingStreamId.value)
          sendScreenShareMessage({ type: "screenShareLeave", streamId: screenShareViewingStreamId.value });
        closeAllScreenSharePeers();
        screenShareViewing.value = false;
        screenShareViewingStreamId.value = "";
        screenShareRemoteStream.value = null;
      }
    },
  };

  return {
    handlers,
    startScreenShareStatsPolling: stats.startScreenShareStatsPolling,
    stopScreenShareStatsPolling: stats.stopScreenShareStatsPolling,
    closeScreenSharePeer,
    closeAllScreenSharePeers,
    startScreenShareViewer,
    startNativeScreenShareViewer,
    handleScreenShareSignal,
    startScreenShare,
    stopScreenShare,
    joinScreenShare,
    leaveScreenShare,
    stopScreenShareTransport,
    upsertScreenShareStream,
    normalizeScreenShareViewers,
    sendScreenShareMessage,
    consumePendingStart,
    clearPendingStart,
    releaseCapture,
  };
}
