import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { useAdminConnectionsStore } from "@/features/admin/users/connections/adminConnections";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

function setup() {
  const getJson = vi.fn(async () => ({ records: [{ id: "w-1" }, { id: "w-2" }], total: 61 }));
  Object.assign(useAdminSessionStore(), { getJson });
  return { store: useAdminConnectionsStore(), feedback: useAdminFeedbackStore(), getJson };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

describe("the connection history", () => {
  it("shows the newest few for the card and refreshes live only on the first page", async () => {
    const s = setup();
    await s.store.showPreview();
    expect(s.getJson).toHaveBeenLastCalledWith("/api/admin/connections?limit=8&offset=0&statuses=disconnected%2Cfailed");
    await s.store.showPages();
    await s.store.goToPage(2);
    s.getJson.mockClear();
    expect(s.store.refreshLive()).toBeUndefined();
    expect(s.getJson).not.toHaveBeenCalled();
    await s.store.goToPage(1);
    await s.store.refreshLive();
    expect(s.getJson).toHaveBeenCalledTimes(2);
  });

  it("loads the first page without filters", async () => {
    const s = setup();
    await s.store.showPages();
    expect(s.getJson).toHaveBeenCalledWith("/api/admin/connections?limit=25&offset=0&statuses=disconnected%2Cfailed");
    expect(s.store.list.items).toHaveLength(2);
    expect(s.store.list.total).toBe(61);
    expect(s.store.pageCount).toBe(3);
    expect(s.store.list.loading).toBe(false);
    expect(s.store.filtered).toBe(false);
  });

  it("asks for the page that was picked, and never past the last one", async () => {
    const s = setup();
    await s.store.showPages();
    await s.store.goToPage(3);
    expect(s.getJson).toHaveBeenLastCalledWith("/api/admin/connections?limit=25&offset=50&statuses=disconnected%2Cfailed");
    await s.store.goToPage(99);
    expect(s.store.list.page).toBe(3);
    await s.store.goToPage(-2);
    expect(s.store.list.page).toBe(1);
  });

  it("starts again at the first page when a filter changes, and clears them", async () => {
    const s = setup();
    await s.store.showPages();
    await s.store.goToPage(3);
    await s.store.filter({ status: "failed", search: " olga " });
    expect(s.getJson).toHaveBeenLastCalledWith("/api/admin/connections?limit=25&offset=0&statuses=failed&q=olga");
    expect(s.store.list.page).toBe(1);
    expect(s.store.filtered).toBe(true);
    await s.store.clearFilters();
    expect(s.getJson).toHaveBeenLastCalledWith("/api/admin/connections?limit=25&offset=0&statuses=disconnected%2Cfailed");
    expect(s.store.filtered).toBe(false);
  });

  it("refreshes in the background without the spinner or a banner, on the page and filters that are set", async () => {
    const s = setup();
    await s.store.showPages();
    await s.store.filter({ status: "failed" });
    await s.store.goToPage(2);
    const pending = s.store.loadConnections(true);
    expect(s.store.list.loading).toBe(false);
    await pending;
    expect(s.getJson).toHaveBeenLastCalledWith("/api/admin/connections?limit=25&offset=25&statuses=failed");
    s.getJson.mockRejectedValueOnce({ code: "RATE_LIMITED" });
    await s.store.loadConnections(true);
    expect(s.feedback.errorMessage).toBe("");
  });

  it("keeps the answer of the newest query when an older one arrives late", async () => {
    const s = setup();
    let release: (value: unknown) => void = () => {};
    s.getJson.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)) as never);
    const slow = s.store.loadConnections();
    s.getJson.mockResolvedValueOnce({ records: [{ id: "new" }], total: 1 });
    await s.store.filter({ status: "disconnected" });
    release({ records: [{ id: "old" }], total: 9 });
    await slow;
    expect(s.store.list.items).toEqual([{ id: "new" }]);
    expect(s.store.list.loading).toBe(false);
  });

  it("reports a failed request in the shared banner and empties on reset", async () => {
    const s = setup();
    s.getJson.mockRejectedValueOnce({ code: "RATE_LIMITED" });
    await s.store.showPages();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText("RATE_LIMITED"));
    await s.store.showPages();
    s.store.reset();
    expect(s.store.list).toMatchObject({ items: [], total: 0, page: 1, status: "ended", search: "" });
  });
});
