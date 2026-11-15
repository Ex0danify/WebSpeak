export { useConnection, type ConnectionDeps } from "@/features/session/useConnection";
export { useSessionActions, type RoomActionsDeps } from "@/features/session/useSessionActions";
export { useSessionStore, type PokeNotification } from "@/features/session/sessionStore";
export { createMessageRouter, createRosterHandlers, type MessageHandlers } from "@/features/session/messageRouter";
export { SCREEN_SHARE_NEGOTIATION_TIMEOUT_MS, getScreenShareIceServers } from "@/features/session/iceServers";
export { protocolErrorMessage } from "@/features/session/connectionMessages";
export { errorKey, safeClientErrorCode, safeClientErrorDetail, visibleErrorCode } from "@/features/session/sessionErrors";
export type {
  ChannelGroup,
  ChannelInfo,
  ChannelMember,
  ChatMessage,
  LatencyProbeResult,
  LinkPreviewData,
  LinkPreviewImage,
  PermissionEntry,
  RoomNotice,
  ServerEvent,
  ServerEventKind,
  ServerGroup,
  VoiceState,
} from "@/features/session/sessionTypes";
export {
  channelNameText,
  isSpeaking,
  memberDisplayName,
  messageAvatar,
  nicknameText,
  privateConversationKey,
} from "@/features/session/format";
export { MAX_CHAT_SEND_LENGTH } from "@/features/session/sessionLimits";
export { summarizeLatency, type LatencySummary } from "@/features/session/latencySummary";
export { translations as sessionMessages } from "@/features/session/i18n/index.js";
