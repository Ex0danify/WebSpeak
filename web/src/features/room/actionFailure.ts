import { toast } from "@/shared/composables/useToast.js";
import { LocalizedError, resolveText } from "@/shared/i18n/localizedText.js";
import { useI18n } from "@/shared/i18n/useI18n.js";

// Two parts with a reason take longer to read than a confirmation.
const FAILURE_TOAST_MS = 6000;

/** The reason a person can act on. The generic gateway failure says nothing the title does not, so it is left out. */
function failureReason(error: unknown): string {
  if (error instanceof LocalizedError) return error.code === "OPERATION_FAILED" ? "" : resolveText(error.text);
  return error instanceof Error ? error.message : "";
}

/** A refusal toast that names the action that failed, followed by the reason and an optional hint on what it means. */
export function toastActionFailureReason(title: string, reason: string, hint = ""): void {
  const description = [reason, hint].filter(Boolean).join(" ");
  toast({ title, ...(description ? { description } : {}), variant: "danger", duration: FAILURE_TOAST_MS });
}

export function toastActionFailure(title: string, error: unknown, hint = ""): void {
  toastActionFailureReason(title, failureReason(error), hint);
}

/** The local mute stays when the sync fails, so the hint says what others may see instead. */
export function toastMuteSyncFailure(error: unknown, muted: boolean): void {
  const { t } = useI18n();
  toastActionFailure(t("muteSyncFailed"), error, muted ? t("muteSyncHintMuted") : t("muteSyncHintUnmuted"));
}
