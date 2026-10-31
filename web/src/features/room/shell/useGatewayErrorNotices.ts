import { watch } from "vue";
import { resolveText } from "@/shared/i18n/localizedText.js";
import { notifyEvent, notifyState } from "@/features/room/shell/roomNotify";
import type { RoomNotice, VoiceState } from "@/features/session";

// The gateway can repeat an error per audio frame, so one code is shown at most once in this window.
const REPEAT_WINDOW_MS = 5000;
// These describe a condition and never report it gone, so the notice lapses when the errors stop coming. The severity is
// decided per code here, a code that is not listed is a one-off and gets a toast.
const STATE_SEVERITY: Readonly<Record<string, RoomNotice["variant"]>> = {
  INVALID_AUDIO_FRAME: "danger",
  SESSION_NOT_READY: "warning",
  WEBRTC_DISABLED: "warning",
};
const STATE_LAPSE_MS = 10_000;

/** Shows gateway errors that answer no request (flood protection, malformed frames, a session that is not ready), which
 *  nothing else in the room shows. Errors that carry a request id have their caller, and a password-protected channel
 *  opens its dialog, so neither is handled here. */
export function useGatewayErrorNotices(state: Pick<VoiceState, "connected" | "unattributedError">): void {
  const shownAt = new Map<string, number>();

  watch(
    () => state.unattributedError,
    (error) => {
      if (!error || !state.connected || error.code === "CHANNEL_PASSWORD_REQUIRED") return;
      const severity = STATE_SEVERITY[error.code];
      if (severity) {
        notifyState(error.code, error.text, { variant: severity, expiresAfterMs: STATE_LAPSE_MS });
        return;
      }
      const now = Date.now();
      const last = shownAt.get(error.code);
      if (last !== undefined && now - last < REPEAT_WINDOW_MS) return;
      shownAt.set(error.code, now);
      notifyEvent(resolveText(error.text), { variant: "danger" });
    },
  );
}
