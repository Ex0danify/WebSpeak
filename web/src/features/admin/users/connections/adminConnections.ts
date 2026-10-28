import { computed, reactive } from "vue";
import { defineStore } from "pinia";
import type { AdminConnectionRecord } from "@/features/admin/core/adminTypes.js";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";

/** How many records the card on the users page shows, and how many a page of the full list holds. */
export const CONNECTION_PREVIEW = 8;
export const CONNECTION_PAGE_SIZE = 25;

/** What the history lists: live sessions are in the sessions card, so it is the sessions that ended, or one way of ending. */
export type ConnectionStatusFilter = "ended" | "disconnected" | "failed";

const STATUSES_OF: Record<ConnectionStatusFilter, string> = {
  ended: "disconnected,failed",
  disconnected: "disconnected",
  failed: "failed",
};

function initialList() {
  return {
    items: [] as AdminConnectionRecord[],
    total: 0,
    limit: CONNECTION_PREVIEW,
    page: 1,
    loading: false,
    status: "ended" as ConnectionStatusFilter,
    search: "",
  };
}

/** The connection history: every guest session the gateway recorded, a page at a time. */
export const useAdminConnectionsStore = defineStore("adminConnections", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();

  const list = reactive(initialList());
  // A slow answer to an earlier query must not replace the one of the filters that are set now.
  let latest = 0;

  const pageCount = computed(() => Math.max(1, Math.ceil(list.total / list.limit)));
  const filtered = computed(() => list.status !== "ended" || list.search.trim() !== "");

  /** `silent` is a refresh in the background: no spinner, no banner when it fails. */
  async function loadConnections(silent = false) {
    const request = ++latest;
    if (!silent) list.loading = true;
    await feedback.attempt(
      async () => {
        const query = new URLSearchParams({ limit: String(list.limit), offset: String((list.page - 1) * list.limit) });
        query.set("statuses", STATUSES_OF[list.status]);
        if (list.search.trim()) query.set("q", list.search.trim());
        const result = await admin.getJson(`/api/admin/connections?${query}`);
        if (request !== latest) return;
        list.items = Array.isArray(result.records) ? result.records : [];
        list.total = Number(result.total) || 0;
      },
      () => {
        if (request === latest && !silent) list.loading = false;
      },
      silent,
    );
  }

  /** The newest few without filters, for the card. */
  function showPreview() {
    Object.assign(list, { limit: CONNECTION_PREVIEW, page: 1, status: "ended", search: "" });
    return loadConnections();
  }

  /** The whole history, a page at a time, for the full view. */
  function showPages() {
    Object.assign(list, { limit: CONNECTION_PAGE_SIZE, page: 1, status: "ended", search: "" });
    return loadConnections();
  }

  /** The live refresh. Only the first page moves, someone reading further back keeps the page they are on. */
  function refreshLive() {
    return list.page === 1 ? loadConnections(true) : undefined;
  }

  function goToPage(page: number) {
    list.page = Math.min(Math.max(1, page), pageCount.value);
    return loadConnections();
  }

  /** A change of the filters starts again at the first page. */
  function filter(changes: Partial<Pick<typeof list, "status" | "search">>) {
    Object.assign(list, changes, { page: 1 });
    return loadConnections();
  }

  function clearFilters() {
    return filter({ status: "ended", search: "" });
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    latest += 1;
    Object.assign(list, initialList());
  }

  return { list, pageCount, filtered, loadConnections, showPreview, showPages, refreshLive, goToPage, filter, clearFilters, reset };
});
