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

/** A screen-share stream as the gateway describes it. Structural twin of `ScreenShareStream`: the session
 *  layer sits below `screenShare` and cannot import it. */
export interface ScreenShareStreamPayload {
  streamId: string;
  source: "browser" | "teamspeak";
  ownerPeerId: string;
  ownerClientId?: number;
  ownerNickname: string;
  name: string;
  audio: boolean;
  createdAt: number;
  viewerCount: number;
  viewers: { peerId: string; nickname: string; avatar?: string }[];
}

/** WebRTC signalling relayed between screen-share peers (structural twin of `ScreenShareSignal`). */
export interface ScreenShareSignalPayload {
  kind: "offer" | "answer" | "iceCandidate" | "close";
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

/** Every JSON control frame the gateway sends to the browser, keyed by `type`. Checked against the senders in
 *  `src/server/voice-bridge.ts`; fields the gateway only sometimes sends are optional. */
export type ServerMessage =
  // Connection lifecycle
  | {
      type: "connected";
      tsClientId: number;
      members: ChannelMember[];
      serverEventLog: ServerEvent[];
      whisperTargetIds: number[];
      whisperActive: boolean;
      webrtcAvailable: boolean;
      screenShareIceServers: unknown;
      accelerated: boolean;
      identity?: string;
    }
  | { type: "disconnected"; recoverable: boolean }
  | { type: "reconnecting"; attempt: number; delayMs: number }
  | { type: "reconnected" }
  | { type: "reconnectFailed"; code: string; detail?: string }
  | { type: "connectionFailed"; code: string; detail?: string }
  // Roster, chat, events
  | { type: "memberEnter"; id: number; nickname: string; uid?: string; avatar?: string; isSelf?: boolean }
  | { type: "memberLeave"; id: number }
  | { type: "memberAvatar"; id: number; uid?: string; avatar?: string }
  | { type: "channelList"; channels: ChannelInfo[] }
  | {
      type: "chatMessage";
      scope: ChatMessage["scope"];
      targetId?: string;
      senderUid?: string;
      timestamp: number;
      invokerName: string;
      invokerId: number;
      message: string;
    }
  | { type: "serverEvent"; event: ServerEvent }
  | { type: "pokeReceived"; invokerId: number; invokerUid: string; invokerName: string; message: string; timestamp: number }
  // Commands and probes
  | { type: "channelSwitched"; requestId?: string; channelId: string | number }
  | { type: "commandCompleted"; requestId: string }
  | { type: "whisperTargets"; targetIds: number[]; active: boolean }
  | { type: "error"; requestId?: string; error: { code: string; message: string; recoverable: boolean }; message?: string }
  | {
      type: "latencyPong";
      sequence: string;
      teamSpeakLatencyMs: number | null;
      teamSpeakReachable: boolean;
      teamSpeakErrorCode: string | null;
    }
  // Audio
  | { type: "voiceActivity"; clientIds: number[] }
  | { type: "audioError"; code: string; detail?: string }
  | { type: "webrtcAnswer"; payload: { sdp: string } }
  | { type: "webrtcError"; code: string }
  // Screen share
  | { type: "screenShareList"; streams: ScreenShareStreamPayload[] }
  | { type: "screenShareStarted"; requestId?: string; stream: ScreenShareStreamPayload; owner: boolean }
  | { type: "screenShareJoined"; requestId?: string; stream: ScreenShareStreamPayload; ownerPeerId: string; mode: "browser" | "teamspeak" }
  | { type: "screenShareStopped"; streamId: string; reason: string }
  | { type: "screenShareLeft"; streamId: string }
  | { type: "screenShareCompleted"; requestId: string }
  | { type: "screenShareViewerCount"; streamId: string; viewerCount: number; viewers: { peerId: string; nickname: string; avatar?: string }[] }
  | { type: "screenShareViewerJoined"; streamId: string; viewerPeerId: string; viewerNickname: string }
  | { type: "screenShareNativeViewerJoined"; streamId: string; viewerPeerId: string; viewerClientId: number }
  | { type: "screenShareViewerLeft"; streamId: string; viewerPeerId: string }
  | { type: "screenShareSignal"; streamId: string; fromPeerId: string; signal: ScreenShareSignalPayload }
  | { type: "screenShareError"; requestId?: string; code: string; message: string };

export type ServerMessageType = ServerMessage["type"];
