import type { WebSocket } from "ws";
import type { DirectorySynchronizer, TSClient } from "../teamspeak/index.js";
import type { Logger } from "../../shared/logger.js";
import type { WebSpeakError } from "../../shared/errors.js";
import type { TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";
import type { MessageParams } from "../../shared/messageCodes.js";
import type { AccelerationRelayOptions } from "../relay/index.js";
import type { ManagedSession } from "./session/voiceSessionManager.js";
import type { WebRtcAudioSession } from "./webrtc/webrtcAudioSession.js";
import type { OpusCodec } from "./voiceOpus.js";

export interface AdminSessionSummary {
  id: string;
  nickname: string;
  target: string;
  clientIp: string;
  /** The acceleration relay the session goes through, null for a direct one. */
  relayName: string | null;
  relayTarget: string | null;
  state: string;
  createdAt: string;
  ageSeconds: number;
  tsClientId: number | null;
  channelId: string | null;
  memberCount: number;
  audio: AudioFlowStats;
}

export interface AudioFlowStats {
  ingressFrames: number;
  ingressDroppedFrames: number;
  ingressFirstAt: number | null;
  ingressLastAt: number | null;
  ingressMaxGapMs: number;
  tsSendFrames: number;
  tsSendErrors: number;
  tsSendFirstAt: number | null;
  tsSendLastAt: number | null;
  tsSendMaxGapMs: number;
  tsEncodeMaxMs: number;
  tsReceiveFrames: number;
  tsReceiveFirstAt: number | null;
  tsReceiveLastAt: number | null;
  tsReceiveMaxGapMs: number;
  egressFrames: number;
  egressDroppedFrames: number;
  egressFirstAt: number | null;
  egressLastAt: number | null;
  egressMaxGapMs: number;
  egressSentFirstAt: number | null;
  egressSentLastAt: number | null;
  egressSentMaxGapMs: number;
  egressPeakBufferedBytes: number;
  egressFramesByClient: Record<string, number>;
  webrtcIngressRtpFrames: number;
  webrtcIngressRtpFirstAt: number | null;
  webrtcIngressRtpLastAt: number | null;
  webrtcIngressRtpMaxGapMs: number;
  webrtcEgressRtpFrames: number;
  webrtcEgressRtpFirstAt: number | null;
  webrtcEgressRtpLastAt: number | null;
  webrtcEgressRtpMaxGapMs: number;
  webrtcQueuePeakFrames: number;
  webrtcQueueDroppedFrames: number;
  webrtcQueueUnderrunTicks: number;
  webrtcPacerLateTicks: number;
  webrtcQueueCurrentFrames: number;
  webrtcIngressQuietFrames: number;
  webrtcIngressDecodeErrors: number;
  webrtcDownlinkDecodedFrames: number;
  webrtcDownlinkDecodeErrors: number;
  webrtcDownlinkShortFrames: number;
}

export interface ChannelMember {
  id: number;
  nickname: string;
  uid: string;
  avatar?: string;
  away?: boolean;
  awayMessage?: string;
  inputMuted?: boolean;
  outputMuted?: boolean;
  channelCommander?: boolean;
}

export interface ServerEvent {
  id: string;
  kind: "joined" | "left" | "moved" | "poke" | "connection" | "channelCreated" | "channelRenamed" | "channelDeleted";
  message: string;
  // message is English and only a fallback, the browser renders event_<kind> and params repeat the values for it.
  nickname?: string;
  channelName?: string;
  params?: MessageParams;
  timestamp: number;
}

export interface WebClientEntry {
  id: string;
  session: ManagedSession;
  tsClient: TSClient;
  ws: WebSocket;
  nickname: string;
  rememberIdentity: boolean;
  clientIp: string;
  target: TeamSpeakTarget;
  accelerationRelay?: { name: string; target: string };
  acceleration?: AccelerationRelayOptions;
  identityLeaseKey?: string;
  webrtcPublicHost?: string;
  channelTree: unknown[];
  members: Map<number, ChannelMember>;
  clientChannelId?(clientId: number): bigint | undefined;
  avatarCache: Map<string, string | null>;
  eventLog: ServerEvent[];
  opusEncoder: OpusCodec | null;
  opusEncoderWarnedAt: number; // time of the last "Opus encoder unavailable" warning, used to rate-limit it
  invalidFrameWarnedAt: number; // time of the last INVALID_AUDIO_FRAME answer, used to rate-limit it
  whisperTargetIds: Set<number>;
  whisperActive: boolean;
  isAlive: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  audio: AudioFlowStats;
  webrtc: WebRtcAudioSession | null;
  lastLatencyProbeAt: number;
  connectionFailureCode?: string;
  connectionFailureDetail?: string;
  screenPeerId: string;
}

export interface VoiceConnectionState {
  tsReady: boolean;
  selfId: number;
  selfChannelId: bigint;
  initialStateSent: boolean;
  audioReady: boolean;
  realtimeReady: boolean;
  hasConnectedOnce: boolean;
  // Set when the server kicks or bans this client. Kick and transport drop can arrive in either
  // order, so the reason waits here for whichever handler runs second.
  pendingKickReason: WebSpeakError | null;
  reconnectStartedAt: number;
  reconnectAttempt: number;
  directoryTimer: NodeJS.Timeout | null;
  avatarRefreshTimer: ReturnType<typeof setTimeout> | null;
  avatarRefreshRunning: boolean;
}

/** Everything one connection's handlers share, created once the TS client exists. */
export interface VoiceConnection {
  entry: WebClientEntry;
  session: ManagedSession;
  ws: WebSocket;
  tsClient: TSClient;
  logger: Logger;
  channelName: string | undefined;
  serverPassword: string | undefined;
  /** Tells the join route whether the server accepted the password the visitor typed. */
  reportPasswordOutcome?: (accepted: boolean) => void;
  directory: DirectorySynchronizer;
  avatarRequests: Set<string>;
  sendJson: (message: Record<string, unknown>) => void;
  state: VoiceConnectionState;
}
