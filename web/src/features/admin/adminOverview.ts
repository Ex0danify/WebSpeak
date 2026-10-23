import { reactive } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "@/features/admin/adminApi.js";
import { adminSiblings } from "@/features/admin/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/adminSession.js";

interface OverviewServer {
  id: string;
  name: string;
  target: string;
  status: "reachable" | "unreachable" | "unknown";
  lastTestAt: string | null;
  latencyMs: number | null;
}

function initialOverview() {
  return {
    gateway: { version: "", uptimeSeconds: 0 },
    servers: [] as OverviewServer[],
    sessions: { active: 0, peak: 0, limit: 100 },
    recentEvents: [] as Array<{ event: string; createdAt: string }>,
  };
}

/** The overview page's data: gateway/server/session status and recent events, plus the database backup download that hangs off the diagnostics card. */
export const useAdminOverviewStore = defineStore("adminOverview", () => {
  const session = useAdminSessionStore();

  const overview = reactive(initialOverview());

  async function loadOverview() {
    Object.assign(overview, await session.getJson("/api/admin/overview"));
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
      // The backup counts as an operation, so the operations page is refreshed after it.
      await adminSiblings().loadOperations();
    } catch (error) {
      session.errorMessage = session.errorText((error as ApiError).code);
    }
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(overview, initialOverview());
  }

  return { overview, loadOverview, downloadBackup, reset };
});
