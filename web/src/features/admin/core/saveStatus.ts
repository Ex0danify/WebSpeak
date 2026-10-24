import { getCurrentScope, onScopeDispose, reactive, ref } from "vue";

export type SaveState = "idle" | "saving" | "saved";

/** How long "Saved" stays before it fades. */
export const SAVED_VISIBLE_MS = 2500;

/**
 * What one autosaved part of the console says about its last save: saving, saved (for a moment) or the error that stays until a save
 * goes through. The settings cards and the server list show it in the same place.
 */
export function createSaveStatus(visibleMs = SAVED_VISIBLE_MS) {
  const state = ref<SaveState>("idle");
  const error = ref("");
  let timer: ReturnType<typeof setTimeout> | undefined;

  function stopTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function saving() {
    stopTimer();
    state.value = "saving";
  }

  function saved() {
    stopTimer();
    error.value = "";
    state.value = "saved";
    timer = setTimeout(() => {
      state.value = "idle";
    }, visibleMs);
  }

  function failed(message: string) {
    stopTimer();
    state.value = "idle";
    error.value = message;
  }

  /** A save went through elsewhere, so an old error is no longer true. */
  function clearError() {
    error.value = "";
  }

  /** Back to nothing said, no timer left running. */
  function reset() {
    stopTimer();
    state.value = "idle";
    error.value = "";
  }

  if (getCurrentScope()) onScopeDispose(stopTimer);

  return reactive({ state, error, saving, saved, failed, clearError, reset });
}

export type SaveStatus = ReturnType<typeof createSaveStatus>;
