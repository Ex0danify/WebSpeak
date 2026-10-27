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

/** The counters of a finished session boiled down to what an admin reads. A voice frame is 20 ms. */
export interface SessionAudioSummary {
  talkSeconds: number;
  framesSent: number;
  framesReceived: number;
  droppedFrames: number;
  sendErrors: number;
}

export function summarizeAudioStats(stats: AudioFlowStats): SessionAudioSummary | null {
  if (stats.tsSendFrames === 0 && stats.tsReceiveFrames === 0) return null;
  return {
    talkSeconds: Math.round(stats.tsSendFrames / 50),
    framesSent: stats.tsSendFrames,
    framesReceived: stats.tsReceiveFrames,
    droppedFrames: stats.ingressDroppedFrames + stats.egressDroppedFrames + stats.webrtcQueueDroppedFrames,
    sendErrors: stats.tsSendErrors,
  };
}
