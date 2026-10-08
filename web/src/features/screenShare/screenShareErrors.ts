import { text, type LocalizedText } from "@/shared/i18n/localizedText";
import { errorKey, safeClientErrorDetail } from "@/features/session";

/** Codes the gateway puts in a `screenShareError` frame. Each has an `err_<CODE>` text. */
export const SCREEN_SHARE_ERROR_CODES: ReadonlySet<string> = new Set([
  "INVALID_SCREEN_SHARE_REQUEST", "INVALID_SCREEN_SHARE_NAME", "INVALID_SCREEN_SHARE_STREAM", "INVALID_SCREEN_SHARE_PEER",
  "INVALID_SCREEN_SHARE_SIGNAL", "INVALID_SCREEN_SHARE_AUDIO", "UNKNOWN_SCREEN_SHARE_MESSAGE", "SCREEN_SHARE_ALREADY_ACTIVE",
  "SCREEN_SHARE_NOT_FOUND", "SCREEN_SHARE_TARGET_MISMATCH", "SCREEN_SHARE_NOT_OWNER", "SCREEN_SHARE_OWNER_CANNOT_JOIN",
  "SCREEN_SHARE_SIGNAL_FORBIDDEN", "SCREEN_SHARE_SOURCE_UNAVAILABLE", "SCREEN_SHARE_INVALID_SIGNAL", "SCREEN_SHARE_SIGNAL_FAILED",
  "SCREEN_SHARE_PEER_NOT_FOUND", "SCREEN_SHARE_JOIN_FAILED", "SCREEN_SHARE_NATIVE_PUBLISHER_STOPPED",
]);

/** The two codes that may carry the TeamSpeak error text as `params.detail`. */
const DETAIL_KEYS: Record<string, "screenShareSignalFailedDetail" | "screenShareJoinFailedDetail"> = {
  SCREEN_SHARE_SIGNAL_FAILED: "screenShareSignalFailedDetail",
  SCREEN_SHARE_JOIN_FAILED: "screenShareJoinFailedDetail",
};

/** What a `screenShareError` frame shows: the text of its code, never the gateway's `message`. */
export function screenShareErrorMessage(code: string, params?: Record<string, unknown>): LocalizedText {
  if (!SCREEN_SHARE_ERROR_CODES.has(code)) return text("screenShareOperationFailed");
  const detail = safeClientErrorDetail(params?.detail);
  if (detail && DETAIL_KEYS[code]) return text(DETAIL_KEYS[code], { detail });
  return text(errorKey(code));
}
