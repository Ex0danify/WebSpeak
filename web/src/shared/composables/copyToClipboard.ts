import { showToast } from "@/shared/composables/useToast";

/** Copies `text` and confirms or reports the failure with a short toast. A browser without the clipboard API stays silent. */
export function copyToClipboard(text: string, messages: { copied: string; failed: string }): void {
  navigator.clipboard?.writeText(text).then(
    () => showToast(messages.copied),
    () => showToast(messages.failed, "danger"),
  );
}
