import type { RoomNotice, VoiceState } from "@/features/session";

export type AudioLinkStatus = "connected" | "connecting" | "disconnected";

/** Whether the voice link is up, following the session and the audio notices the voice engine raises while it sets the link up. */
export function audioLinkStatus(
  state: Pick<VoiceState, "connected" | "connecting" | "reconnecting" | "reconnectFailed">,
  notices: ReadonlyArray<Pick<RoomNotice, "code">>,
): AudioLinkStatus {
  if (state.reconnectFailed) return "disconnected";
  if (state.connecting || state.reconnecting) return "connecting";
  if (!state.connected) return "disconnected";
  if (notices.some((notice) => notice.code === "VOICE_FAILED")) return "disconnected";
  if (notices.some((notice) => notice.code === "VOICE_CONNECTING")) return "connecting";
  return "connected";
}
