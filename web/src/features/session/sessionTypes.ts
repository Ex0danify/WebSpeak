import type { MaybeLocalizedText } from "@/shared/i18n/localizedText";

export interface VoiceState {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  reconnectFailed: boolean;
  tsClientId: number;
  /** Rendered at the edge with `resolveText`, so a language switch re-renders it. */
  error: MaybeLocalizedText;
  errorCode: string;
  /** A gateway error that answers no request. Replaced on every one so a watcher sees repeats of the same code too. */
  unattributedError: { code: string; text: MaybeLocalizedText } | null;
  /**
   * Non-fatal audio diagnostics. Unlike error/errorCode they never take over the connect form, they explain a degraded
   * microphone or playback path while the voice room stays joined and usable.
   */
  microphoneError: MaybeLocalizedText;
  microphoneErrorCode: string;
  channelSwitchedChannelId: string;
}

/** A condition of the room that stays true until it is fixed, shown by the room notice banner. */
export interface RoomNotice {
  /** Stable identifier, a notice with the same code is replaced instead of stacked. */
  code: string;
  text: MaybeLocalizedText;
  title: MaybeLocalizedText;
  variant: "info" | "warning" | "danger";
  /** A notice replaces the others of its group, the audio diagnostics are one line that reflects the latest. */
  group?: string;
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
  /** Server group ids, resolved against the list of `serverGroups` frames. */
  serverGroups?: number[];
  /** The group in the member's current channel, resolved against the `channelGroups` frames. */
  channelGroupId?: number;
  /** Shares a screen, in any channel. */
  streaming?: boolean;
  /** The gateway sends an empty nickname with this flag; the view renders `unnamedMember`. */
  unnamed?: boolean;
}

export interface ChannelInfo {
  id: string;
  parentID: string;
  order?: string;
  name: string;
  /** Empty `name` plus this flag: the view renders `unnamedChannel`. */
  unnamed?: boolean;
  description?: string;
  members?: {
    id: number;
    nickname: string;
    unnamed?: boolean;
    uid?: string;
    avatar?: string;
    away?: boolean;
    awayMessage?: string;
    inputMuted?: boolean;
    outputMuted?: boolean;
    channelCommander?: boolean;
    serverGroups?: number[];
    channelGroupId?: number;
    streaming?: boolean;
  }[];
}

/** A server group as the server lists it, in display order. `iconId` 0 means no icon. */
export interface ServerGroup {
  id: number;
  name: string;
  iconId: number;
}

/** Channel groups come in the same shape, but hold per channel and one per member. */
export type ChannelGroup = ServerGroup;

/** One of our own permissions as the server reported it, by its TeamSpeak name. */
export interface PermissionEntry {
  name: string;
  value: number;
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
  /** Your own message until the gateway confirmed it, or after it refused (`denied` when TeamSpeak lacked the permission) or timed out. Absent for a delivered or received one. */
  status?: "pending" | "failed" | "denied";
  /** On a private message of your own: the recipient's nickname when it was sent, to name the chat after they have left. */
  peerName?: string;
}

/** Values a gateway code is rendered with, the same shape in every frame that carries them. */
export type MessageParams = Record<string, string | number | boolean>;

/** The kinds of the server event log, the same list as the gateway's `ServerEvent` (the contract test compares them). */
export type ServerEventKind =
  "joined" | "left" | "moved" | "selfMoved" | "renamed" | "poke" | "connection" | "channelCreated" | "channelRenamed" | "channelDeleted";

export interface ServerEvent {
  id: string;
  kind: ServerEventKind;
  // English, for logs. The sentence shown is built from the kind, the names and the params.
  message: string;
  nickname?: string;
  /** For a rename, the name before it. */
  previousNickname?: string;
  /** The channel the event happened in: where a member joined or left, where a member or you moved to. */
  channelId?: string;
  /** For a move, the channel the member came from. */
  fromChannelId?: string;
  channelName?: string;
  // Optional values for rendering the sentence in the user's language.
  params?: MessageParams;
  timestamp: number;
}

export interface LatencyProbeResult {
  browserRttMs: number;
  teamSpeakLatencyMs: number | null;
  teamSpeakReachable: boolean;
  teamSpeakErrorCode?: string;
}

/** A screen-share stream as the gateway describes it. Structural twin of `ScreenShareStream`, the session layer
 *  sits below `screenShare` and cannot import it. */
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
 *  `src/server/voice-bridge.ts`, fields the gateway only sometimes sends are optional. */
export type ServerMessage =
  | {
      type: "connected";
      tsClientId: number;
      serverName: string;
      members: ChannelMember[];
      serverEventLog: ServerEvent[];
      whisperTargetIds: number[];
      whisperActive: boolean;
      canSpeak: boolean;
      canWriteChannel: boolean;
      canWriteServer: boolean;
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
  | { type: "memberEnter"; id: number; nickname: string; uid?: string; avatar?: string; isSelf?: boolean }
  | { type: "memberLeave"; id: number }
  | { type: "memberAvatar"; id: number; uid?: string; avatar?: string }
  | { type: "memberUpdate"; id: number; uid?: string; nickname: string; unnamed?: boolean }
  | { type: "channelList"; channels: ChannelInfo[] }
  | { type: "serverGroups"; groups: ServerGroup[] }
  | { type: "channelGroups"; groups: ChannelGroup[] }
  | { type: "serverGroupIcon"; iconId: number; icon: string }
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
  | { type: "channelSwitched"; requestId?: string; channelId: string | number }
  | { type: "commandCompleted"; requestId: string }
  | { type: "identity"; requestId?: string; identity: string }
  | { type: "whisperTargets"; targetIds: number[]; active: boolean }
  | { type: "talkState"; canSpeak: boolean }
  | { type: "chatState"; canWriteChannel: boolean; canWriteServer: boolean }
  | { type: "permissions"; entries: PermissionEntry[] }
  | {
      type: "error";
      requestId?: string;
      error: { code: string; message: string; recoverable: boolean; params?: MessageParams };
      message?: string;
    }
  | {
      type: "latencyPong";
      sequence: string;
      teamSpeakLatencyMs: number | null;
      teamSpeakReachable: boolean;
      teamSpeakErrorCode: string | null;
    }
  | { type: "voiceActivity"; clientIds: number[] }
  | { type: "audioError"; code: string; detail?: string }
  | { type: "webrtcAnswer"; payload: { sdp: string } }
  | { type: "webrtcError"; code: string }
  | { type: "screenShareList"; streams: ScreenShareStreamPayload[] }
  | { type: "screenShareStarted"; requestId?: string; stream: ScreenShareStreamPayload; owner: boolean }
  | { type: "screenShareJoined"; requestId?: string; stream: ScreenShareStreamPayload; ownerPeerId: string; mode: "browser" | "teamspeak" }
  | { type: "screenShareStopped"; streamId: string; reason: string }
  | { type: "screenShareLeft"; streamId: string }
  | { type: "screenShareCompleted"; requestId: string }
  | {
      type: "screenShareViewerCount";
      streamId: string;
      viewerCount: number;
      viewers: { peerId: string; nickname: string; avatar?: string }[];
    }
  | { type: "screenShareViewerJoined"; streamId: string; viewerPeerId: string; viewerNickname: string }
  | { type: "screenShareNativeViewerJoined"; streamId: string; viewerPeerId: string; viewerClientId: number }
  | { type: "screenShareViewerLeft"; streamId: string; viewerPeerId: string }
  | { type: "screenShareSignal"; streamId: string; fromPeerId: string; signal: ScreenShareSignalPayload }
  | { type: "screenShareError"; requestId?: string; code: string; message: string; params?: MessageParams };

export type ServerMessageType = ServerMessage["type"];
