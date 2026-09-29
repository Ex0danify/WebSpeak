import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "../lib/admin-api.js";
import { useI18n } from "../i18n/use-i18n.js";
import { useAdminOverviewStore } from "./adminOverview.js";
import { useAdminSessionStore } from "./adminSession.js";

export interface AdminSession { id: string; nickname: string; target: string; state: string; createdAt: string; ageSeconds: number; tsClientId: number | null; channelId: string | null; memberCount: number }
export interface ManagedInvite { id: string; target: string; channel: string; expiresAt: string; maxUses: number; useCount: number; createdAt: string; revokedAt: string | null; status: "active" | "expired" | "exhausted" | "revoked" }
export interface AdminLog { timestamp: string | null; level: string; message: string; context: Record<string, string | number | boolean> }
export interface AdminConnectionRecord { id: string; nickname: string; clientIp: string; target: string; relayName: string | null; relayTarget: string | null; startedAt: string; connectedAt: string | null; disconnectedAt: string | null; durationSeconds: number | null; status: "active" | "connecting" | "disconnected" | "failed"; reason: string | null; failureDetail: string | null }

function initialInviteForm() {
  return { channel: "", expiresInHours: 24, maxUses: 0 };
}

function initialOperations() {
  return { sessions: [] as AdminSession[], invites: [] as ManagedInvite[], diagnostics: { version: "", node: "", platform: "", arch: "", schemaVersion: 0, createdSessions: 0 }, logs: { available: false, entries: [] as AdminLog[], sessions: [] as AdminConnectionRecord[] }, audit: [] as Array<{ event: string; createdAt: string }> };
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

  async function loadOperations() { operationsLoading.value = true; try { const [sessions, invites, diagnostics, logs, audit] = await Promise.all([admin.getJson("/api/admin/sessions"), admin.getJson("/api/admin/invites"), admin.getJson("/api/admin/diagnostics"), admin.getJson("/api/admin/logs?limit=100"), admin.getJson("/api/admin/audit?limit=50")]); operations.sessions = Array.isArray(sessions.sessions) ? sessions.sessions : []; operations.invites = Array.isArray(invites.invites) ? invites.invites : []; operations.diagnostics = { version: String(diagnostics.gateway?.version || ""), node: String(diagnostics.gateway?.node || ""), platform: String(diagnostics.gateway?.platform || ""), arch: String(diagnostics.gateway?.arch || ""), schemaVersion: Number(diagnostics.database?.schemaVersion || 0), createdSessions: Number(diagnostics.sessions?.created || 0) }; operations.logs = { available: Boolean(logs.available), entries: Array.isArray(logs.entries) ? logs.entries : [], sessions: Array.isArray(logs.sessions) ? logs.sessions : [] }; operations.audit = Array.isArray(audit.events) ? audit.events : []; } catch (error) { admin.errorMessage = admin.errorText((error as ApiError).code); } finally { operationsLoading.value = false; } }
  async function terminateSession(target: AdminSession) { if (!window.confirm(t('confirmTerminate', { nickname: target.nickname }))) return; terminatingSession.value = target.id; admin.errorMessage = ""; try { await admin.sendJson(`/api/admin/sessions/${encodeURIComponent(target.id)}/terminate`, "POST", {}); await Promise.all([loadOperations(), useAdminOverviewStore().loadOverview()]); admin.notify(t('sessionTerminated')); } catch (error) { admin.errorMessage = admin.errorText((error as ApiError).code); } finally { terminatingSession.value = ""; } }
  async function createInvite() { admin.submitting = true; admin.errorMessage = ""; createdInvite.value = null; try { const result = await admin.sendJson("/api/admin/invites", "POST", { channel: inviteForm.channel, expiresInHours: inviteForm.expiresInHours, maxUses: inviteForm.maxUses }); if (typeof result.token !== "string") throw new Error("INVITE_CREATE_FAILED"); createdInvite.value = { token: result.token, link: `${location.origin}/?invite=${encodeURIComponent(result.token)}` }; inviteForm.channel = ""; await loadOperations(); } catch (error) { admin.errorMessage = admin.errorText((error as ApiError).code); } finally { admin.submitting = false; } }
  async function revokeInvite(invite: ManagedInvite) { if (!window.confirm(t('confirmRevoke'))) return; try { await admin.sendJson(`/api/admin/invites/${encodeURIComponent(invite.id)}/revoke`, "POST", {}); await loadOperations(); admin.notify(t('inviteRevoked')); } catch (error) { admin.errorMessage = admin.errorText((error as ApiError).code); } }
  async function copyInviteLink() { if (!createdInvite.value) return; try { await navigator.clipboard.writeText(createdInvite.value.link); admin.notify(t('copiedLink')); } catch { admin.errorMessage = t('operationFailed'); } }

  /** Back to the empty state, for logout: setup stores have no `$reset`. */
  function reset() {
    Object.assign(operations, initialOperations());
    Object.assign(inviteForm, initialInviteForm());
    createdInvite.value = null;
    terminatingSession.value = "";
    operationsLoading.value = false;
  }

  return { operations, operationsLoading, terminatingSession, inviteForm, createdInvite, loadOperations, terminateSession, createInvite, revokeInvite, copyInviteLink, reset };
});
