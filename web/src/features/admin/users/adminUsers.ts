import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { AdminSession, ManagedInvite } from "@/features/admin/core/adminTypes.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useDialog } from "@/shared/composables/useDialog.js";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { adminSiblings } from "@/features/admin/core/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";

function initialInviteForm() {
  return { serverId: "", channel: "", expiresInHours: 24, maxUses: 0 };
}

interface UsersData {
  sessions: AdminSession[];
  invites: ManagedInvite[];
}

function initialUsers(): UsersData {
  return { sessions: [], invites: [] };
}

/** The users page: the live guest sessions and the managed invite links. */
export const useAdminUsersStore = defineStore("adminUsers", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const { t } = useI18n();
  const { confirm } = useDialog();

  const usersLoading = ref(false);
  const terminatingSession = ref("");
  const creatingInvite = ref(false);
  const inviteForm = reactive(initialInviteForm());
  const createdInvite = ref<{ token: string; link: string } | null>(null);
  const users = reactive(initialUsers());

  async function loadUsers() {
    usersLoading.value = true;
    await feedback.attempt(
      async () => {
        const [sessions, invites] = await Promise.all([admin.getJson("/api/admin/sessions"), admin.getJson("/api/admin/invites")]);
        users.sessions = Array.isArray(sessions.sessions) ? sessions.sessions : [];
        users.invites = Array.isArray(invites.invites) ? invites.invites : [];
      },
      () => {
        usersLoading.value = false;
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
        await Promise.all([loadUsers(), adminSiblings().loadOverview()]);
        feedback.notify(t("sessionTerminated"));
      },
      () => {
        terminatingSession.value = "";
      },
    );
  }

  async function createInvite() {
    creatingInvite.value = true;
    feedback.clearError();
    createdInvite.value = null;
    await feedback.attempt(
      async () => {
        const result = await admin.sendJson("/api/admin/invites", "POST", {
          serverId: inviteForm.serverId,
          channel: inviteForm.channel,
          expiresInHours: inviteForm.expiresInHours,
          maxUses: inviteForm.maxUses,
        });
        if (typeof result.token !== "string") throw new Error("INVITE_CREATE_FAILED");
        createdInvite.value = { token: result.token, link: `${location.origin}/?invite=${encodeURIComponent(result.token)}` };
        inviteForm.channel = "";
        await loadUsers();
      },
      () => {
        creatingInvite.value = false;
      },
    );
  }

  async function revokeInvite(invite: ManagedInvite) {
    const ok = await confirm({
      title: t("confirmRevokeTitle"),
      message: t("confirmRevoke"),
      confirmLabel: t("revoke"),
      cancelLabel: t("confirmCancel"),
      variant: "danger",
    });
    if (!ok) return;
    await feedback.attempt(async () => {
      await admin.sendJson(`/api/admin/invites/${encodeURIComponent(invite.id)}/revoke`, "POST", {});
      await loadUsers();
      feedback.notify(t("inviteRevoked"));
    });
  }

  async function copyInviteLink() {
    if (!createdInvite.value) return;
    try {
      await navigator.clipboard.writeText(createdInvite.value.link);
      feedback.notify(t("copiedLink"));
    } catch {
      feedback.showError(t("operationFailed"));
    }
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(users, initialUsers());
    Object.assign(inviteForm, initialInviteForm());
    createdInvite.value = null;
    terminatingSession.value = "";
    usersLoading.value = false;
    creatingInvite.value = false;
  }

  return {
    users,
    usersLoading,
    terminatingSession,
    creatingInvite,
    inviteForm,
    createdInvite,
    loadUsers,
    terminateSession,
    createInvite,
    revokeInvite,
    copyInviteLink,
    reset,
  };
});
