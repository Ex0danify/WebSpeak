import { ref } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "@/features/admin/core/adminApi.js";
import { createAdminFormat } from "@/features/admin/core/adminFormat.js";
import { createSaveStatus, type SaveStatus } from "@/features/admin/core/saveStatus.js";
import { toast } from "@/shared/composables/useToast";
import { useI18n } from "@/shared/i18n/useI18n.js";

/** The status of the server list on the server page: add, edit, remove and reorder all report there. */
export const SERVER_LIST_STATUS = "servers";

function notify(message: string) {
  toast({ title: message, variant: "success" });
}

/**
 * What the console tells the person after an action. A failure shows in the one banner until the next action clears it, a success in a
 * toast. A part of a page that saves by itself (the server list) has a status of its own instead, the same one the settings cards show.
 */
export const useAdminFeedbackStore = defineStore("adminFeedback", () => {
  const { language, t } = useI18n();
  const { errorText } = createAdminFormat(language, t);

  const errorMessage = ref("");

  const statuses = new Map<string, SaveStatus>();

  /** The autosave status named `key`, made on first use. Stores that must not import each other meet here. */
  function statusOf(key: string): SaveStatus {
    let status = statuses.get(key);
    if (!status) {
      status = createSaveStatus();
      statuses.set(key, status);
    }
    return status;
  }

  function showError(message: string) {
    errorMessage.value = message;
  }

  /** Shows a failed request by the code the gateway answered with. */
  function fail(error: unknown) {
    errorMessage.value = errorText((error as ApiError).code);
  }

  function clearError() {
    errorMessage.value = "";
  }

  /** Runs `action`, shows a failure in the banner (not when `quiet`, for a refresh nobody asked for), and always runs `cleanup` after. */
  async function attempt(action: () => Promise<void>, cleanup?: () => void, quiet = false) {
    try {
      await action();
    } catch (error) {
      if (!quiet) fail(error);
    } finally {
      cleanup?.();
    }
  }

  /** Shows a failed save in the status it belongs to, by the code the gateway answered with. */
  function failStatus(key: string, error: unknown) {
    statusOf(key).failed(errorText((error as ApiError).code));
  }

  return { errorMessage, errorText, notify, showError, fail, clearError, attempt, statusOf, failStatus };
});
