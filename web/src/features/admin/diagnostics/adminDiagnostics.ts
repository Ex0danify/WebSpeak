import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { adminSiblings } from "@/features/admin/core/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";

interface AdminFacts {
  version: string;
  node: string;
  platform: string;
  arch: string;
  schemaVersion: number;
  createdSessions: number;
}

interface DiagnosticsData {
  facts: AdminFacts;
}

function initialDiagnostics(): DiagnosticsData {
  return {
    facts: { version: "", node: "", platform: "", arch: "", schemaVersion: 0, createdSessions: 0 },
  };
}

/** The diagnostics page: runtime facts with the database backup. */
export const useAdminDiagnosticsStore = defineStore("adminDiagnostics", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();

  const diagnosticsLoading = ref(false);
  const diagnostics = reactive(initialDiagnostics());

  /** `silent` is a refresh in the background: no spinner, no banner when it fails. */
  async function loadDiagnostics(silent = false) {
    if (!silent) diagnosticsLoading.value = true;
    await feedback.attempt(
      async () => {
        const facts = await admin.getJson("/api/admin/diagnostics");
        diagnostics.facts = {
          version: String(facts.gateway?.version || ""),
          node: String(facts.gateway?.node || ""),
          platform: String(facts.gateway?.platform || ""),
          arch: String(facts.gateway?.arch || ""),
          schemaVersion: Number(facts.database?.schemaVersion || 0),
          createdSessions: Number(facts.sessions?.created || 0),
        };
      },
      () => {
        if (!silent) diagnosticsLoading.value = false;
      },
      silent,
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
      // The export is written to the event log, which the page shows.
      await Promise.all([loadDiagnostics(), adminSiblings().loadEvents()]);
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
