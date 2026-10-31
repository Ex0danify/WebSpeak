import { watch } from "vue";
import { toast } from "@/shared/composables/useToast.js";
import { resolveText } from "@/shared/i18n/localizedText.js";
import type { VoiceState } from "@/features/session";

// The gateway can repeat an error per audio frame, so one code is shown at most once in this window.
const REPEAT_WINDOW_MS = 5000;
const TOAST_MS = 6000;

/** Toasts gateway errors that answer no request (flood protection, malformed frames, a session that is not ready), which
 *  nothing else in the room shows. Errors that carry a request id have their caller, and a password-protected channel
 *  opens its dialog, so neither is toasted here. */
export function useGatewayErrorToasts(state: Pick<VoiceState, "connected" | "unattributedError">): void {
  const shownAt = new Map<string, number>();

  watch(
    () => state.unattributedError,
    (error) => {
      if (!error || !state.connected || error.code === "CHANNEL_PASSWORD_REQUIRED") return;
      const now = Date.now();
      const last = shownAt.get(error.code);
      if (last !== undefined && now - last < REPEAT_WINDOW_MS) return;
      shownAt.set(error.code, now);
      toast({ title: resolveText(error.text), variant: "danger", duration: TOAST_MS });
    },
  );
}
