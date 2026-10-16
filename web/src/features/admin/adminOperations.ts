import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "@/features/admin/adminApi.js";
import type { AdminConnectionRecord, AdminLog, AdminSession, ManagedInvite } from "@/features/admin/adminTypes.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { adminSiblings } from "@/features/admin/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/adminSession.js";

function initialInviteForm() {
  return { channel: "", expiresInHours: 24, maxUses: 0 };
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

/** The operations page: live sessions, invite links, diagnostics, logs and the audit trail. */
export const useAdminOperationsStore = defineStore("adminOperations", () => {
  const admin = useAdminSessionStore();
  const { t } = useI18n();

  const operationsLoading = ref(false);
  const terminatingSession = ref("");
  const inviteForm = reactive(initialInviteForm());
  const createdInvite = ref<{ token: string; link: string } | null>(null);
  const operations = reactive(initialOperations());

  /** Runs `action`, shows a failure in the shared banner, and always runs `cleanup` after. */
  async function attempt(action: () => Promise<void>, cleanup?: () => void) {
    try {
      await action();
    } catch (error) {
      admin.errorMessage = admin.errorText((error as ApiError).code);
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
    if (!window.confirm(t("confirmTerminate", { nickname: target.nickname }))) return;
    terminatingSession.value = target.id;
    admin.errorMessage = "";
    await attempt(
      async () => {
        await admin.sendJson(`/api/admin/sessions/${encodeURIComponent(target.id)}/terminate`, "POST", {});
        await Promise.all([loadOperations(), adminSiblings().loadOverview()]);
        admin.notify(t("sessionTerminated"));
      },
      () => {
        terminatingSession.value = "";
      },
    );
  }

  async function createInvite() {
    admin.submitting = true;
    admin.errorMessage = "";
    createdInvite.value = null;
    await attempt(
      async () => {
        const result = await admin.sendJson("/api/admin/invites", "POST", {
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
        admin.submitting = false;
      },
    );
  }

  async function revokeInvite(invite: ManagedInvite) {
    if (!window.confirm(t("confirmRevoke"))) return;
    await attempt(async () => {
      await admin.sendJson(`/api/admin/invites/${encodeURIComponent(invite.id)}/revoke`, "POST", {});
      await loadOperations();
      admin.notify(t("inviteRevoked"));
    });
  }

  async function copyInviteLink() {
    if (!createdInvite.value) return;
    try {
      await navigator.clipboard.writeText(createdInvite.value.link);
      admin.notify(t("copiedLink"));
    } catch {
      admin.errorMessage = t("operationFailed");
    }
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(operations, initialOperations());
    Object.assign(inviteForm, initialInviteForm());
    createdInvite.value = null;
    terminatingSession.value = "";
    operationsLoading.value = false;
  }

  return {
    operations,
    operationsLoading,
    terminatingSession,
    inviteForm,
    createdInvite,
    loadOperations,
    terminateSession,
    createInvite,
    revokeInvite,
    copyInviteLink,
    reset,
  };
});
