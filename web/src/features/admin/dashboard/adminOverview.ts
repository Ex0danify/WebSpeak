import { reactive } from "vue";
import { defineStore } from "pinia";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";

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
    invites: { active: 0 },
    recentEvents: [] as Array<{ event: string; createdAt: string }>,
  };
}

/** The overview page's data: gateway, server and session status and the recent events. */
export const useAdminOverviewStore = defineStore("adminOverview", () => {
  const session = useAdminSessionStore();

  const overview = reactive(initialOverview());

  async function loadOverview() {
    Object.assign(overview, await session.getJson("/api/admin/overview"));
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(overview, initialOverview());
  }

  return { overview, loadOverview, reset };
});
