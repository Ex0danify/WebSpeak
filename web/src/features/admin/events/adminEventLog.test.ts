import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import { DEFAULT_EVENT_CATEGORIES, EVENT_PAGE_SIZE, EVENT_PREVIEW, useAdminEventLogStore } from "@/features/admin/events/adminEventLog";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const DEFAULTS = DEFAULT_EVENT_CATEGORIES.join(",");

function setup() {
  const admin = useAdminSessionStore();
  const getJson = vi.fn<(url: string) => Promise<Record<string, unknown>>>(async () => ({ events: [{ id: 1 }], total: 1 }));
  Object.assign(admin, { getJson });
  return { store: useAdminEventLogStore(), feedback: useAdminFeedbackStore(), getJson };
}

function lastQuery(getJson: ReturnType<typeof setup>["getJson"]): URLSearchParams {
  const url = getJson.mock.lastCall![0];
  return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the event log", () => {
  it("leaves out the availability changes unless they are asked for", () => {
    expect(DEFAULT_EVENT_CATEGORIES).not.toContain("availability");
    expect(DEFAULT_EVENT_CATEGORIES).toHaveLength(4);
  });

  it("showPreview asks for the newest few of the default categories and keeps the total", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({ events: [{ id: 2 }, { id: 1 }], total: 40 });
    await s.store.showPreview(5);
    expect(s.getJson).toHaveBeenCalledWith(`/api/admin/audit?limit=5&offset=0&categories=${encodeURIComponent(DEFAULTS)}&severities=info%2Cwarning%2Cerror`);
    expect(s.store.list.items).toHaveLength(2);
    expect(s.store.list.total).toBe(40);
    expect(s.store.list.loading).toBe(false);
    await s.store.showPreview();
    expect(lastQuery(s.getJson).get("limit")).toBe(String(EVENT_PREVIEW));
  });

  it("falls back to an empty list when the answer has no events", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({});
    await s.store.showPreview();
    expect(s.store.list.items).toEqual([]);
    expect(s.store.list.total).toBe(0);
  });

  it("changes the page size, stays at the same entry, remembers the choice and ignores a size that is not offered", async () => {
    localStorage.clear();
    const s = setup();
    s.getJson.mockResolvedValue({ events: [], total: 500 });
    await s.store.showPages();
    await s.store.goToPage(5);
    expect(lastQuery(s.getJson).get("offset")).toBe("100");
    await s.store.setPageSize(50);
    expect(lastQuery(s.getJson).get("limit")).toBe("50");
    expect(lastQuery(s.getJson).get("offset")).toBe("100");
    expect(s.store.list.page).toBe(3);
    await s.store.setPageSize(7);
    expect(s.store.list.limit).toBe(50);
    await s.store.showPages();
    expect(s.store.list.limit).toBe(50);
    await s.store.showPreview();
    expect(s.store.list.limit).toBe(EVENT_PREVIEW);
    localStorage.clear();
    await s.store.showPages();
    expect(s.store.list.limit).toBe(EVENT_PAGE_SIZE);
  });

  it("pages, and a change of the filters starts again at the first page", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({ events: [], total: 60 });
    await s.store.showPages();
    expect(s.store.pageCount).toBe(3);
    await s.store.goToPage(3);
    expect(lastQuery(s.getJson).get("offset")).toBe(String(2 * EVENT_PAGE_SIZE));
    await s.store.goToPage(9);
    expect(s.store.list.page).toBe(3);
    await s.store.filter({ severities: ["warning", "error"] });
    expect(s.store.list.page).toBe(1);
    expect(lastQuery(s.getJson).get("offset")).toBe("0");
    expect(lastQuery(s.getJson).get("severities")).toBe("warning,error");
  });

  it("sends the categories, the search and the start of the time range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
    const s = setup();
    await s.store.showPages();
    await s.store.filter({ categories: ["availability"], search: "  main ", range: "day" });
    const query = lastQuery(s.getJson);
    expect(query.get("categories")).toBe("availability");
    expect(query.get("q")).toBe("main");
    expect(query.get("since")).toBe("2026-03-09T12:00:00.000Z");
    await s.store.filter({ categories: [], range: "month" });
    expect(lastQuery(s.getJson).get("categories")).toBe("");
    expect(lastQuery(s.getJson).get("since")).toBe("2026-02-08T12:00:00.000Z");
    expect(lastQuery(s.getJson).has("q")).toBe(true);
  });

  it("knows when the filters differ from the defaults, and clears them", async () => {
    const s = setup();
    await s.store.showPages();
    expect(s.store.filtered).toBe(false);
    await s.store.filter({ categories: [...DEFAULT_EVENT_CATEGORIES, "availability"] });
    expect(s.store.filtered).toBe(true);
    await s.store.filter({ categories: ["auth", "config", "invites", "system"] });
    expect(s.store.filtered).toBe(false);
    await s.store.filter({ search: "x" });
    expect(s.store.filtered).toBe(true);
    await s.store.clearFilters();
    expect(s.store.filtered).toBe(false);
    expect(s.store.list.search).toBe("");
  });

  it("keeps the answer of the newest query when an older one arrives later", async () => {
    const s = setup();
    let release: (value: Record<string, unknown>) => void = () => {};
    s.getJson.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const slow = s.store.showPages();
    s.getJson.mockResolvedValueOnce({ events: [{ id: 9 }], total: 1 });
    await s.store.filter({ search: "new" });
    release({ events: [{ id: 1 }, { id: 2 }], total: 2 });
    await slow;
    expect(s.store.list.items).toEqual([{ id: 9 }]);
    expect(s.store.list.loading).toBe(false);
  });

  it("reports a failed request in the shared banner and stops loading", async () => {
    const s = setup();
    s.getJson.mockRejectedValue({ code: "RATE_LIMITED" });
    await s.store.showPreview();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText("RATE_LIMITED"));
    expect(s.store.list.loading).toBe(false);
  });

  it("reset empties the list for logout", async () => {
    const s = setup();
    await s.store.showPages();
    s.store.reset();
    expect(s.store.list.items).toEqual([]);
    expect(s.store.list.limit).toBe(EVENT_PREVIEW);
  });
});
