import { readonly, ref } from "vue";
import type { StatusVariant } from "../ui/shared/status";

// Toast queue. State lives at module level so any component or service can raise a toast without providing anything, one
// <Toaster /> near the app root renders it. A toast confirms something that already happened and may offer one action.

// Anything the user must not miss, or that stays true until fixed (reconnecting, degraded audio), is a Banner, not a toast.
export interface ToastAction {
  label: string;
  onClick: () => void;
  /** Spoken description of the action when the toast is announced. Defaults to `label`. */
  altText?: string;
}

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: StatusVariant;
  /** Milliseconds until it closes itself, 0 keeps it until dismissed. Default 5000, 10000 with an action. */
  duration?: number;
  action?: ToastAction;
}

export interface ToastItem extends Required<Pick<ToastOptions, "title" | "variant" | "duration">> {
  id: number;
  description?: string;
  action?: ToastAction;
}

// Older toasts are dropped first, so a burst cannot bury the page.
const MAX_VISIBLE = 4;

const items = ref<ToastItem[]>([]);
let nextId = 1;

export function toast(options: ToastOptions | string): number {
  const o = typeof options === "string" ? { title: options } : options;
  const id = nextId++;
  const item: ToastItem = {
    id,
    title: o.title,
    description: o.description,
    variant: o.variant ?? "info",
    duration: o.duration ?? (o.action ? 10000 : 5000),
    action: o.action,
  };
  items.value = [...items.value, item].slice(-MAX_VISIBLE);
  return id;
}

export function dismissToast(id?: number) {
  items.value = id === undefined ? [] : items.value.filter((t) => t.id !== id);
}

// Shorthand for a short-lived confirmation/error toast, the shape most call sites want.
export function showToast(title: string, variant: "success" | "danger" = "success"): number {
  return toast({ title, variant, duration: 2800 });
}

export function useToast() {
  return { toasts: readonly(items), toast, dismiss: dismissToast };
}
