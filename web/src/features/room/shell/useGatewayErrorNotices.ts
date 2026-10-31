import { watch } from "vue";
import { resolveText } from "@/shared/i18n/localizedText.js";
import { notifyEvent, notifyState } from "@/features/room/shell/roomNotify";
import type { VoiceState } from "@/features/session";

// The gateway can repeat an error per audio frame, so one code is shown at most once in this window.
const REPEAT_WINDOW_MS = 5000;
// These describe a condition and never report it gone, so the notice lapses when the errors stop coming.
const STATE_CODES: ReadonlySet<string> = new Set(["INVALID_AUDIO_FRAME", "SESSION_NOT_READY", "WEBRTC_DISABLED"]);
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
      if (STATE_CODES.has(error.code)) {
        notifyState(error.code, error.text, { expiresAfterMs: STATE_LAPSE_MS });
        return;
      }
      const now = Date.now();
      const last = shownAt.get(error.code);
      if (last !== undefined && now - last < REPEAT_WINDOW_MS) return;
      shownAt.set(error.code, now);
      notifyEvent(resolveText(error.text));
    },
  );
}
