import { toast } from "@/shared/composables/useToast.js";
import { useDialog, type AlertOptions } from "@/shared/composables/useDialog.js";
import { LocalizedError, resolveText, text, type MaybeLocalizedText } from "@/shared/i18n/localizedText.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useSessionStore, type RoomNotice } from "@/features/session";
import type { StatusVariant } from "@/shared/ui/shared/status";

// How the room tells the user something, three ways. Pick by what the thing is, not by how serious it feels:
//   notifyEvent     something that just happened and can be forgotten (a refusal, a throttle). A toast.
//   notifyState     a condition that stays true until it is fixed (audio degraded, mute out of sync). A banner that goes
//                   away with the condition, so whoever raises it also clears it.
//   notifyBlocking  the user has to acknowledge or decide before going on. A dialog.
// Problems that belong to one form or section are shown inline there, not through these.

const EVENT_TOAST_MS = 6000;
const MUTE_SYNC_CODE = "MUTE_SYNC_FAILED";

/** The reason a person can act on. The generic gateway failure says nothing the title does not, so it is left out. */
function failureReason(error: unknown): string {
  if (error instanceof LocalizedError) return error.code === "OPERATION_FAILED" ? "" : resolveText(error.text);
  return error instanceof Error ? error.message : "";
}

export interface EventOptions {
  /** How serious it is, always the caller's call. */
  variant: StatusVariant;
  /** The thrown value, its specific reason becomes the description. */
  error?: unknown;
  /** A reason already in hand, wins over `error`. */
  reason?: string;
  /** What it means for the user, shown after the reason. */
  hint?: string;
}

/** A toast that names what happened, followed by the reason and an optional hint. */
export function notifyEvent(title: string, options: EventOptions): void {
  const reason = options.reason ?? failureReason(options.error);
  const description = [reason, options.hint].filter(Boolean).join(" ");
  toast({ title, ...(description ? { description } : {}), variant: options.variant, duration: EVENT_TOAST_MS });
}

export interface StateOptions {
  /** How serious it is, always the caller's call. */
  variant: RoomNotice["variant"];
  title?: MaybeLocalizedText;
  /** For a condition the gateway never reports as gone. It lapses this long after the last time it was raised. */
  expiresAfterMs?: number;
}

const expiry = new Map<string, ReturnType<typeof setTimeout>>();

function stopExpiry(code: string): void {
  clearTimeout(expiry.get(code));
  expiry.delete(code);
}

/** Shows a condition in the room banner until `clearState` is called with the same code. Raising it again replaces it. */
export function notifyState(code: string, message: MaybeLocalizedText, options: StateOptions): void {
  const session = useSessionStore();
  session.setRoomNotice({
    code,
    text: message,
    title: options.title ?? text("roomNoticeTitle"),
    variant: options.variant,
  });
  stopExpiry(code);
  if (options.expiresAfterMs) {
    expiry.set(
      code,
      setTimeout(() => clearState(code), options.expiresAfterMs),
    );
  }
}

export function clearState(code: string): void {
  stopExpiry(code);
  useSessionStore().clearRoomNotice(code);
}

/** A dialog the user has to dismiss, resolves once they have. */
export function notifyBlocking(options: AlertOptions): Promise<void> {
  return useDialog().alert(options);
}

/** The local mute stays when the sync fails, so the banner says what others may see instead. */
export function notifyMuteSyncFailure(error: unknown, muted: boolean): void {
  const { t } = useI18n();
  const hint = muted ? t("muteSyncHintMuted") : t("muteSyncHintUnmuted");
  notifyState(MUTE_SYNC_CODE, [failureReason(error), hint].filter(Boolean).join(" "), {
    title: text("muteSyncFailed"),
    variant: "warning",
  });
}

export function clearMuteSyncFailure(): void {
  clearState(MUTE_SYNC_CODE);
}
