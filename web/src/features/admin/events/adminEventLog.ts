import { computed, reactive } from "vue";
import { defineStore } from "pinia";
import type { AdminEvent, AdminEventCategory, AdminEventSeverity } from "@/features/admin/core/adminTypes.js";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";

/** How many events the cards show, and how many a page of the full view holds. */
export const EVENT_PREVIEW = 8;
export const EVENT_PAGE_SIZE = 25;
export const EVENT_PAGE_SIZES = [10, 25, 50, 100] as const;
const PAGE_SIZE_STORAGE_KEY = "webspeak.admin.eventPageSize";

/** The size chosen last in this browser, the default when there is none or storage is blocked. */
function storedPageSize(): number {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return EVENT_PAGE_SIZES.find((size) => size === stored) ?? EVENT_PAGE_SIZE;
  } catch {
    return EVENT_PAGE_SIZE;
  }
}

export const EVENT_CATEGORIES: readonly AdminEventCategory[] = ["auth", "config", "invites", "availability", "sessions", "system"];
/** Availability changes and every session are in the log but not in the way, the filter brings them in. */
const QUIET_CATEGORIES: readonly AdminEventCategory[] = ["availability", "sessions"];
export const DEFAULT_EVENT_CATEGORIES: readonly AdminEventCategory[] = EVENT_CATEGORIES.filter(
  (category) => !QUIET_CATEGORIES.includes(category),
);

export const EVENT_SEVERITIES: readonly AdminEventSeverity[] = ["info", "warning", "error"];
export type EventRange = "" | "day" | "week" | "month";

const RANGE_MS: Record<Exclude<EventRange, "">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

export interface EventFilters {
  categories: AdminEventCategory[];
  severities: AdminEventSeverity[];
  range: EventRange;
  search: string;
}

function initialFilters(): EventFilters {
  return { categories: [...DEFAULT_EVENT_CATEGORIES], severities: [...EVENT_SEVERITIES], range: "", search: "" };
}

function initialList() {
  return { items: [] as AdminEvent[], total: 0, limit: EVENT_PREVIEW, page: 1, loading: false, ...initialFilters() };
}

/** The event log: the list the cards and the full view share, with its filters. */
export const useAdminEventLogStore = defineStore("adminEventLog", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();

  const list = reactive(initialList());
  // A slow answer to an earlier query must not replace the one of the filters that are set now.
  let latest = 0;

  const pageCount = computed(() => Math.max(1, Math.ceil(list.total / list.limit)));
  const filtered = computed(
    () =>
      list.severities.length !== EVENT_SEVERITIES.length ||
      list.range !== "" ||
      list.search.trim() !== "" ||
      list.categories.length !== DEFAULT_EVENT_CATEGORIES.length ||
      DEFAULT_EVENT_CATEGORIES.some((category) => !list.categories.includes(category)),
  );

  /** `silent` is a refresh in the background: no spinner, no banner when it fails. */
  async function loadEvents(silent = false) {
    const request = ++latest;
    if (!silent) list.loading = true;
    await feedback.attempt(
      async () => {
        const query = new URLSearchParams({
          limit: String(list.limit),
          offset: String((list.page - 1) * list.limit),
          categories: list.categories.join(","),
          severities: list.severities.join(","),
        });
        if (list.range) query.set("since", new Date(Date.now() - RANGE_MS[list.range]).toISOString());
        if (list.search.trim()) query.set("q", list.search.trim());
        const result = await admin.getJson(`/api/admin/audit?${query}`);
        if (request !== latest) return;
        list.items = Array.isArray(result.events) ? result.events : [];
        list.total = Number(result.total) || 0;
      },
      () => {
        if (request === latest && !silent) list.loading = false;
      },
      silent,
    );
  }

  /** The live refresh. Only the first page moves, someone reading further back keeps the page they are on. */
  function refreshLive() {
    return list.page === 1 ? loadEvents(true) : undefined;
  }

  /** The newest few without filters, for a card. */
  function showPreview(limit = EVENT_PREVIEW) {
    Object.assign(list, { limit, page: 1 }, initialFilters());
    return loadEvents();
  }

  /** The whole log, a page at a time, for the full view. */
  function showPages() {
    Object.assign(list, { limit: storedPageSize(), page: 1 }, initialFilters());
    return loadEvents();
  }

  /** Keeps the first entry on the screen on the page it lands on with the new size. */
  function setPageSize(size: number) {
    if (!EVENT_PAGE_SIZES.some((allowed) => allowed === size) || size === list.limit) return;
    const first = (list.page - 1) * list.limit;
    Object.assign(list, { limit: size, page: Math.floor(first / size) + 1 });
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
    } catch {
      // the choice then only lasts until the view is left
    }
    return loadEvents();
  }

  function goToPage(page: number) {
    list.page = Math.min(Math.max(1, page), pageCount.value);
    return loadEvents();
  }

  /** A change of the filters starts again at the first page. */
  function filter(changes: Partial<EventFilters>) {
    Object.assign(list, changes, { page: 1 });
    return loadEvents();
  }

  function clearFilters() {
    return filter(initialFilters());
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    latest += 1;
    Object.assign(list, initialList());
  }

  return { list, pageCount, filtered, loadEvents, refreshLive, showPreview, showPages, goToPage, setPageSize, filter, clearFilters, reset };
});
