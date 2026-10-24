import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { AdminConnectionRecord, AdminLog, AdminSession, ManagedInvite } from "@/features/admin/adminTypes.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useDialog } from "@/shared/composables/useDialog.js";
import { useAdminFeedbackStore } from "@/features/admin/adminFeedback.js";
import { adminSiblings } from "@/features/admin/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/adminSession.js";

function initialInviteForm() {
  return { serverId: "", channel: "", expiresInHours: 24, maxUses: 0 };
}

interface AdminAuditEvent {
  event: string;
  createdAt: string;
}

interface AdminDiagnostics {
  version: string;
  node: string;
  platform: string;
  arch: string;
  schemaVersion: number;
  createdSessions: number;
}

interface AdminLogs {
  available: boolean;
  entries: AdminLog[];
  sessions: AdminConnectionRecord[];
}

interface OperationsData {
  sessions: AdminSession[];
  invites: ManagedInvite[];
  diagnostics: AdminDiagnostics;
  logs: AdminLogs;
  audit: AdminAuditEvent[];
}

function initialOperations(): OperationsData {
  return {
    sessions: [],
    invites: [],
    diagnostics: { version: "", node: "", platform: "", arch: "", schemaVersion: 0, createdSessions: 0 },
    logs: { available: false, entries: [], sessions: [] },
    audit: [],
  };
}

/** The operations page: live sessions, invite links, diagnostics with the database backup, logs and the audit trail. */
export const useAdminOperationsStore = defineStore("adminOperations", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const { t } = useI18n();
  const { confirm } = useDialog();

  const operationsLoading = ref(false);
  const terminatingSession = ref("");
  const creatingInvite = ref(false);
  const inviteForm = reactive(initialInviteForm());
  const createdInvite = ref<{ token: string; link: string } | null>(null);
  const operations = reactive(initialOperations());

  /** Runs `action`, shows a failure in the shared banner, and always runs `cleanup` after. */
  async function attempt(action: () => Promise<void>, cleanup?: () => void) {
    try {
      await action();
    } catch (error) {
      feedback.fail(error);
    } finally {
      cleanup?.();
    }
  }

  async function loadOperations() {
    operationsLoading.value = true;
    await attempt(
      async () => {
        const [sessions, invites, diagnostics, logs, audit] = await Promise.all([
          admin.getJson("/api/admin/sessions"),
          admin.getJson("/api/admin/invites"),
          admin.getJson("/api/admin/diagnostics"),
          admin.getJson("/api/admin/logs?limit=100"),
          admin.getJson("/api/admin/audit?limit=50"),
        ]);
        operations.sessions = Array.isArray(sessions.sessions) ? sessions.sessions : [];
        operations.invites = Array.isArray(invites.invites) ? invites.invites : [];
        operations.diagnostics = {
          version: String(diagnostics.gateway?.version || ""),
          node: String(diagnostics.gateway?.node || ""),
          platform: String(diagnostics.gateway?.platform || ""),
          arch: String(diagnostics.gateway?.arch || ""),
          schemaVersion: Number(diagnostics.database?.schemaVersion || 0),
          createdSessions: Number(diagnostics.sessions?.created || 0),
        };
        operations.logs = {
          available: Boolean(logs.available),
          entries: Array.isArray(logs.entries) ? logs.entries : [],
          sessions: Array.isArray(logs.sessions) ? logs.sessions : [],
        };
        operations.audit = Array.isArray(audit.events) ? audit.events : [];
      },
      () => {
        operationsLoading.value = false;
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
    await attempt(
      async () => {
        await admin.sendJson(`/api/admin/sessions/${encodeURIComponent(target.id)}/terminate`, "POST", {});
        await Promise.all([loadOperations(), adminSiblings().loadOverview()]);
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
    await attempt(
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
        await loadOperations();
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
    await attempt(async () => {
      await admin.sendJson(`/api/admin/invites/${encodeURIComponent(invite.id)}/revoke`, "POST", {});
      await loadOperations();
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

  async function downloadBackup() {
    try {
      const response = await fetch("/api/admin/backup", { headers: { accept: "application/octet-stream" } });
      if (!response.ok) throw new Error("BACKUP_FAILED");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `webspeak-backup-${new Date().toISOString().slice(0, 10)}.db`;
      anchor.click();
      URL.revokeObjectURL(url);
      // The export is written to the audit trail, which the page shows.
      await loadOperations();
    } catch (error) {
      feedback.fail(error);
    }
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(operations, initialOperations());
    Object.assign(inviteForm, initialInviteForm());
    createdInvite.value = null;
    terminatingSession.value = "";
    operationsLoading.value = false;
    creatingInvite.value = false;
  }

  return {
    operations,
    operationsLoading,
    terminatingSession,
    creatingInvite,
    inviteForm,
    createdInvite,
    loadOperations,
    terminateSession,
    createInvite,
    revokeInvite,
    copyInviteLink,
    downloadBackup,
    reset,
  };
});
