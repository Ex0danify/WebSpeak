import type { AudioFlowStats, WebClientEntry } from "../voiceTypes.js";
import type { WebRtcIceInfo } from "../iceInfo.js";

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
    webrtcIce: null,
  };
}

export function snapshotAudioStats(entry: WebClientEntry): AudioFlowStats {
  const stats = { ...entry.audio };
  const webRtcStats = entry.webrtc?.getStats();
  if (webRtcStats) Object.assign(stats, webRtcStats);
  return stats;
}

/** Where audio stalled or got lost on its way between the browser, the gateway and TeamSpeak. */
export interface SessionAudioPath {
  transport: "webrtc" | "websocket";
  /** What the browser delivered: RTP packets over WebRTC, binary frames over the socket. */
  uplinkFrames: number;
  uplinkMaxGapMs: number;
  downlinkFrames: number;
  downlinkMaxGapMs: number;
  queueUnderruns: number;
  lateTicks: number;
  decodeErrors: number;
  ice: WebRtcIceInfo | null;
}

/** The counters of a finished session boiled down to what an admin reads. A voice frame is 20 ms. */
export interface SessionAudioSummary {
  talkSeconds: number;
  framesSent: number;
  framesReceived: number;
  droppedFrames: number;
  sendErrors: number;
  path: SessionAudioPath | null;
}

export function summarizeAudioStats(stats: AudioFlowStats): SessionAudioSummary | null {
  const path = summarizeAudioPath(stats);
  if (stats.tsSendFrames === 0 && stats.tsReceiveFrames === 0 && !path) return null;
  return {
    talkSeconds: Math.round(stats.tsSendFrames / 50),
    framesSent: stats.tsSendFrames,
    framesReceived: stats.tsReceiveFrames,
    droppedFrames: stats.ingressDroppedFrames + stats.egressDroppedFrames + stats.webrtcQueueDroppedFrames,
    sendErrors: stats.tsSendErrors,
    path,
  };
}

// A session that never got audio moving has no path, but one that negotiated WebRTC always has: silence there is the finding.
function summarizeAudioPath(stats: AudioFlowStats): SessionAudioPath | null {
  const webrtc = stats.webrtcIce !== null;
  if (!webrtc && stats.ingressFrames === 0 && stats.egressFrames === 0) return null;
  return {
    transport: webrtc ? "webrtc" : "websocket",
    uplinkFrames: webrtc ? stats.webrtcIngressRtpFrames : stats.ingressFrames,
    uplinkMaxGapMs: webrtc ? stats.webrtcIngressRtpMaxGapMs : stats.ingressMaxGapMs,
    downlinkFrames: webrtc ? stats.webrtcEgressRtpFrames : stats.egressFrames,
    downlinkMaxGapMs: webrtc ? stats.webrtcEgressRtpMaxGapMs : stats.egressMaxGapMs,
    queueUnderruns: stats.webrtcQueueUnderrunTicks,
    lateTicks: stats.webrtcPacerLateTicks,
    decodeErrors: stats.webrtcIngressDecodeErrors + stats.webrtcDownlinkDecodeErrors,
    ice: stats.webrtcIce,
  };
}
