import { safeClientErrorCode } from "@/features/session";
import type { MessageKey } from "@/shared/i18n/messageKeys";
import { text, type LocalizedText, type TextParams } from "@/shared/i18n/localizedText";

/**
 * Browsers only hand out a DOMException name for getUserMedia failures, plus a message that is often English and must not reach
 * the UI. Every name the browsers actually raise maps to a sentence the user can act on, and the name stays as the stable
 * failure code.
 */
const MICROPHONE_FAILURE_KEYS: Record<string, MessageKey> = {
  NOTALLOWEDERROR: "micFailedPermission",
  PERMISSIONDENIEDERROR: "micFailedPermission",
  PERMISSION_DISMISSED: "micFailedPermission",
  SECURITYERROR: "micFailedBlocked",
  NOTFOUNDERROR: "micFailedNotFound",
  DEVICESNOTFOUNDERROR: "micFailedNotFound",
  OVERCONSTRAINEDERROR: "micFailedUnavailable",
  NOTREADABLEERROR: "micFailedBusy",
  TRACKSTARTERROR: "micFailedBusy",
  ABORTERROR: "micFailedAborted",
  INVALIDSTATEERROR: "micFailedAborted",
  TYPEERROR: "micFailedParameters",
};

const MICROPHONE_FAILURE_CODE_PREFIX = "MIC_";

/** Turn a getUserMedia / DOMException failure into a stable code plus the sentence to render. */
export function normalizeMicrophoneFailure(error: unknown): { code: string; text: LocalizedText } {
  const rawName = error instanceof Error ? String(error.name || "") : "";
  const name = safeClientErrorCode(rawName).slice(0, 40);
  return {
    code: `${MICROPHONE_FAILURE_CODE_PREFIX}${name || "UNAVAILABLE"}`,
    text: text(MICROPHONE_FAILURE_KEYS[name] ?? "micFailedGeneric"),
  };
}

const DOM_EXCEPTION_KEYS: Record<string, MessageKey> = {
  NotAllowedError: "micFailedPermission",
  NotFoundError: "micFailedNotFound",
  NotReadableError: "micFailedBusy",
  OverconstrainedError: "micFailedUnavailable",
  SecurityError: "micFailedBlocked",
};

/** The sentence for a failure raised by a device action in the settings dialog; `fallback` is what an
 *  error without a known DOMException name gets. */
export function microphoneErrorText(error: unknown, fallback: MessageKey = "micFailedCheckPermissions"): LocalizedText {
  const name = error instanceof DOMException ? error.name : "";
  return text(DOM_EXCEPTION_KEYS[name] ?? fallback);
}

const AUDIO_NOTICE_KEYS: Record<string, MessageKey> = {
  WEBRTC_FALLBACK: "audioNoticeWebrtcFallback",
  PLAYBACK_BLOCKED: "audioNoticePlaybackBlocked",
  DEVICE_LIST_UNAVAILABLE: "audioNoticeDeviceList",
  AUDIO_CONTEXT_SUSPENDED: "audioNoticeContextSuspended",
};

/** The notice for a non-fatal audio condition. `code` is the stable identifier, an unknown code (the gateway's `audioError`)
 *  gets the generic audio-link sentence. `detail` selects the variant that prints it, except for the encoder failure, which
 *  never shows the gateway text. */
export function audioNoticeText(code: string, params?: TextParams): LocalizedText {
  const known = AUDIO_NOTICE_KEYS[code];
  if (known) return text(known, params);
  if (code === "AUDIO_ENCODER_UNAVAILABLE") return text("audioNoticeEncoder", { code });
  const withDetail = typeof params?.detail === "string" && params.detail !== "";
  return text(withDetail ? "audioNoticeLinkDetail" : "audioNoticeLink", { code, ...params });
}
