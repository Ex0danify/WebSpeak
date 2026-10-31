import { ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { notifyEvent } from "@/features/room/shell/roomNotify";
import { useDialog } from "@/shared/composables/useDialog.js";

/** The away toggle: flips the state, asks for a message through the shared prompt and reports both to the server, rolling
 *  back to the previous state if the server refuses. */
export function useAway(setAway: (away: boolean, message: string) => Promise<void>) {
  const { t } = useI18n();
  const { prompt } = useDialog();
  const away = ref(false);
  const awayMessage = ref("");

  async function toggleAway(): Promise<void> {
    const next = !away.value;
    let message = "";
    if (next) {
      const input = await prompt({
        title: t("awayDialogTitle"),
        label: t("awayPrompt"),
        placeholder: t("awayPlaceholder"),
        initial: awayMessage.value,
        confirmLabel: t("awaySubmit"),
        cancelLabel: t("cancel"),
      });
      if (input === null) return; // Cancelled, so stay as you were.
      message = input;
    }
    const previous = { away: away.value, message: awayMessage.value };
    away.value = next;
    awayMessage.value = message;
    try {
      await setAway(next, message);
    } catch (error: unknown) {
      // The server kept the old state, so the button goes back to it.
      away.value = previous.away;
      awayMessage.value = previous.message;
      notifyEvent(t("failAway"), { error });
    }
  }

  return { away, awayMessage, toggleAway };
}
