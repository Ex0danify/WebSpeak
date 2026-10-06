import type { AudioFlowStats, WebClientEntry } from "../voiceTypes.js";

export function createAudioFlowStats(): AudioFlowStats {
  return {
    ingressFrames: 0,
    ingressDroppedFrames: 0,
    ingressFirstAt: null,
    ingressLastAt: null,
    ingressMaxGapMs: 0,
    tsSendFrames: 0,
    tsSendErrors: 0,
    tsSendFirstAt: null,
    tsSendLastAt: null,
    tsSendMaxGapMs: 0,
    tsEncodeMaxMs: 0,
    tsReceiveFrames: 0,
    tsReceiveFirstAt: null,
    tsReceiveLastAt: null,
    tsReceiveMaxGapMs: 0,
    egressFrames: 0,
    egressDroppedFrames: 0,
    egressFirstAt: null,
    egressLastAt: null,
    egressMaxGapMs: 0,
    egressSentFirstAt: null,
    egressSentLastAt: null,
    egressSentMaxGapMs: 0,
    egressPeakBufferedBytes: 0,
    egressFramesByClient: {},
    webrtcIngressRtpFrames: 0,
    webrtcIngressRtpFirstAt: null,
    webrtcIngressRtpLastAt: null,
    webrtcIngressRtpMaxGapMs: 0,
    webrtcEgressRtpFrames: 0,
    webrtcEgressRtpFirstAt: null,
    webrtcEgressRtpLastAt: null,
    webrtcEgressRtpMaxGapMs: 0,
    webrtcQueuePeakFrames: 0,
    webrtcQueueDroppedFrames: 0,
    webrtcQueueUnderrunTicks: 0,
    webrtcPacerLateTicks: 0,
    webrtcQueueCurrentFrames: 0,
    webrtcIngressQuietFrames: 0,
    webrtcIngressDecodeErrors: 0,
    webrtcDownlinkDecodedFrames: 0,
    webrtcDownlinkDecodeErrors: 0,
    webrtcDownlinkShortFrames: 0,
  };
}

export function snapshotAudioStats(entry: WebClientEntry): AudioFlowStats {
  const stats = { ...entry.audio };
  const webRtcStats = entry.webrtc?.getStats();
  if (webRtcStats) Object.assign(stats, webRtcStats);
  return stats;
}
