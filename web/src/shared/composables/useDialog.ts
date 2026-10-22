import { computed, readonly, ref } from "vue";
import type { StatusVariant } from "@/shared/ui/shared/status";

// Imperative, promise-returning dialogs. State lives at module level so a composable or service can raise one without wiring
// reactive state into a view, the way window.confirm/prompt were used before. One <DialogHost /> near the app root renders the
// queue, a single dialog at a time, in the order raised.

// A password flow with its own retry and submit state stays a declarative PasswordDialog, these three cover the one-shot cases.

interface DialogBase {
  title: string;
  /** Body text under the title. */
  message?: string;
  variant?: StatusVariant;
}

export interface ConfirmOptions extends DialogBase {
  confirmLabel: string;
  cancelLabel: string;
}

export interface PromptOptions {
  title: string;
  /** Label of the input. */
  label: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Prefilled value. */
  initial?: string;
  autocomplete?: string;
}

export interface AlertOptions extends DialogBase {
  /** Label of the single acknowledge button. */
  confirmLabel: string;
  /** When set, the alert shows a countdown bar and acknowledges itself after this many milliseconds. */
  timeoutMs?: number;
}

interface Request {
  id: number;
  resolve: (value: boolean | string | null) => void;
}
export interface ConfirmRequest extends Request {
  kind: "confirm";
  options: ConfirmOptions;
}
export interface PromptRequest extends Request {
  kind: "prompt";
  options: PromptOptions;
}
export interface AlertRequest extends Request {
  kind: "alert";
  options: AlertOptions;
}
export type DialogRequest = ConfirmRequest | PromptRequest | AlertRequest;

const queue = ref<DialogRequest[]>([]);
let nextId = 1;

function enqueue(request: Omit<DialogRequest, "id">): void {
  queue.value = [...queue.value, { ...request, id: nextId++ } as DialogRequest];
}

function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => enqueue({ kind: "confirm", options, resolve: resolve as Request["resolve"] }));
}

function requestPrompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => enqueue({ kind: "prompt", options, resolve: resolve as Request["resolve"] }));
}

function requestAlert(options: AlertOptions): Promise<void> {
  return new Promise((resolve) => enqueue({ kind: "alert", options, resolve: () => resolve() }));
}

const current = computed<DialogRequest | null>(() => queue.value[0] ?? null);

// Closes the active request with its result, then shows the next. A stale id (the host answering one already gone) is ignored.
function settle(id: number, value: boolean | string | null): void {
  const active = queue.value[0];
  if (!active || active.id !== id) return;
  active.resolve(value);
  queue.value = queue.value.slice(1);
}

export function useDialog() {
  return { confirm: requestConfirm, prompt: requestPrompt, alert: requestAlert };
}

/** For the host component only. */
export function useDialogQueue() {
  return { current: readonly(current), settle };
}
