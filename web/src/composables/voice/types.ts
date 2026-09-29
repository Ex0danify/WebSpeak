export interface VoiceState {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  reconnectFailed: boolean;
  tsClientId: number;
  error: string;
  errorCode: string;
  /**
   * Non-fatal audio diagnostics. Unlike error/errorCode these never take over
   * the connect form: they explain a degraded microphone or playback path while
   * the voice room itself stays joined and usable.
   */
  microphoneError: string;
  microphoneErrorCode: string;
  audioNotice: string;
  audioNoticeCode: string;
  channelSwitchedChannelId: string;
}

export interface ScreenShareStream {
  streamId: string;
  source: "browser" | "teamspeak";
  ownerPeerId: string;
  ownerClientId?: number;
  ownerNickname: string;
  name: string;
  audio: boolean;
  createdAt: number;
  viewerCount: number;
  viewers: ScreenShareViewer[];
}

export interface ScreenShareViewer {
  peerId: string;
  nickname: string;
  avatar?: string;
}

export interface ScreenShareOutputSettings {
  maxWidth?: number;
  maxHeight?: number;
  maxFrameRate?: number;
}

export interface ScreenShareCaptureStats {
  width: number | null;
  height: number | null;
  frameRate: number | null;
}

export interface ScreenSharePeerStats {
  peerId: string;
  role: "owner" | "viewer";
  direction: "outbound" | "inbound";
  connectionState: string;
  iceConnectionState: string;
  codec: string | null;
  candidateType: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  bitrateKbps: number | null;
  packetsLost: number | null;
  packetsTotal: number | null;
  lossPercent: number | null;
  framesDropped: number | null;
  jitterMs: number | null;
  roundTripTimeMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  qualityLimitationReason: string | null;
}

export interface ScreenShareWebRtcStats {
  updatedAt: number | null;
  capture: ScreenShareCaptureStats | null;
  peers: ScreenSharePeerStats[];
}

export interface ScreenShareSignal {
  kind: "offer" | "answer" | "iceCandidate" | "close";
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface ChannelMember {
  id: number;
  nickname: string;
  uid?: string;
  avatar?: string;
  isSelf?: boolean;
  away?: boolean;
  awayMessage?: string;
  inputMuted?: boolean;
  outputMuted?: boolean;
  channelCommander?: boolean;
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export type AudioPermission = "unknown" | "granted" | "denied";

export interface MicrophoneProcessingSettings {
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  rnnoise: boolean | null;
}

export type SinkAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export interface ChannelInfo {
  id: string;
  parentID: string;
  order?: string;
  name: string;
  description?: string;
  members?: { id: number; nickname: string; uid?: string; avatar?: string; away?: boolean; awayMessage?: string; inputMuted?: boolean; outputMuted?: boolean; channelCommander?: boolean }[];
}

export interface ChatMessage {
  id: string;
  scope: "channel" | "server" | "private" | "system";
  targetId?: string;
  conversationId?: string;
  senderId?: number;
  senderUid?: string;
  invokerName: string;
  message: string;
  timestamp: number;
  isSelf?: boolean;
}

export interface ServerEvent {
  id: string;
  kind: string;
  message: string;
  // Set by a gateway that builds a translatable sentence instead of Chinese text (F24); an older
  // gateway sends neither, and `message` is shown as it is.
  nickname?: string;
  channelName?: string;
  timestamp: number;
}

export interface LatencyProbeResult {
  browserRttMs: number;
  teamSpeakLatencyMs: number | null;
  teamSpeakReachable: boolean;
  teamSpeakErrorCode?: string;
}
