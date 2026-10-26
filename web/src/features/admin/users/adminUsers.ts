import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { AdminSession } from "@/features/admin/core/adminTypes.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useDialog } from "@/shared/composables/useDialog.js";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { adminSiblings } from "@/features/admin/core/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";

/** How many sessions the card on the users page shows, and how many a page of the full view holds. */
export const SESSION_PREVIEW = 8;
export const SESSION_PAGE_SIZE = 25;

/** The live guest sessions. Their invite links are in `adminInvites`. */
export const useAdminUsersStore = defineStore("adminUsers", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const { t } = useI18n();
  const { confirm } = useDialog();

  const sessionsLoading = ref(false);
  const terminatingSession = ref("");
  const users = reactive({ sessions: [] as AdminSession[] });

  async function loadSessions() {
    sessionsLoading.value = true;
    await feedback.attempt(
      async () => {
        const sessions = await admin.getJson("/api/admin/sessions");
        users.sessions = Array.isArray(sessions.sessions) ? sessions.sessions : [];
      },
      () => {
        sessionsLoading.value = false;
      },
    );
  }

  async function terminateSession(target: AdminSession) {
    const ok = await confirm({
      title: t("confirmTerminateTitle"),
      message: t("confirmTerminate", { nickname: target.nickname }),
      confirmLabel: t("endSession"),
      cancelLabel: t("confirmCancel"),
      variant: "danger",
    });
    if (!ok) return;
    terminatingSession.value = target.id;
    feedback.clearError();
    await feedback.attempt(
      async () => {
        await admin.sendJson(`/api/admin/sessions/${encodeURIComponent(target.id)}/terminate`, "POST", {});
        await Promise.all([loadSessions(), adminSiblings().loadOverview()]);
        feedback.notify(t("sessionTerminated"));
      },
      () => {
        terminatingSession.value = "";
      },
    );
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    users.sessions = [];
    terminatingSession.value = "";
    sessionsLoading.value = false;
  }

  return { users, sessionsLoading, terminatingSession, loadSessions, terminateSession, reset };
});
