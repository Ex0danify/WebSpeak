import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { AdminConnectionRecord, AdminLog } from "@/features/admin/core/adminTypes.js";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";

interface AdminAuditEvent {
  event: string;
  createdAt: string;
}

interface AdminFacts {
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

interface DiagnosticsData {
  facts: AdminFacts;
  logs: AdminLogs;
  audit: AdminAuditEvent[];
}

function initialDiagnostics(): DiagnosticsData {
  return {
    facts: { version: "", node: "", platform: "", arch: "", schemaVersion: 0, createdSessions: 0 },
    logs: { available: false, entries: [], sessions: [] },
    audit: [],
  };
}

/** The diagnostics page: runtime facts with the database backup, the logs and the audit trail. */
export const useAdminDiagnosticsStore = defineStore("adminDiagnostics", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();

  const diagnosticsLoading = ref(false);
  const diagnostics = reactive(initialDiagnostics());

  async function loadDiagnostics() {
    diagnosticsLoading.value = true;
    await feedback.attempt(
      async () => {
        const [facts, logs, audit] = await Promise.all([
          admin.getJson("/api/admin/diagnostics"),
          admin.getJson("/api/admin/logs?limit=100"),
          admin.getJson("/api/admin/audit?limit=50"),
        ]);
        diagnostics.facts = {
          version: String(facts.gateway?.version || ""),
          node: String(facts.gateway?.node || ""),
          platform: String(facts.gateway?.platform || ""),
          arch: String(facts.gateway?.arch || ""),
          schemaVersion: Number(facts.database?.schemaVersion || 0),
          createdSessions: Number(facts.sessions?.created || 0),
        };
        diagnostics.logs = {
          available: Boolean(logs.available),
          entries: Array.isArray(logs.entries) ? logs.entries : [],
          sessions: Array.isArray(logs.sessions) ? logs.sessions : [],
        };
        diagnostics.audit = Array.isArray(audit.events) ? audit.events : [];
      },
      () => {
        diagnosticsLoading.value = false;
      },
    );
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
      await loadDiagnostics();
    } catch (error) {
      feedback.fail(error);
    }
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(diagnostics, initialDiagnostics());
    diagnosticsLoading.value = false;
  }

  return { diagnostics, diagnosticsLoading, loadDiagnostics, downloadBackup, reset };
});
