import { ref } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "@/features/admin/core/adminApi.js";
import { createAdminFormat } from "@/features/admin/core/adminFormat.js";
import { toast } from "@/shared/composables/useToast";
import { useI18n } from "@/shared/i18n/useI18n.js";

/** What the console tells the person after an action. A failure shows in the one banner until the next action clears it, a success in a toast. */
export const useAdminFeedbackStore = defineStore("adminFeedback", () => {
  const { language, t } = useI18n();
  const { errorText } = createAdminFormat(language, t);

  const errorMessage = ref("");

  function notify(message: string) {
    toast({ title: message, variant: "success" });
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

  return { errorMessage, errorText, notify, showError, fail, clearError };
});
