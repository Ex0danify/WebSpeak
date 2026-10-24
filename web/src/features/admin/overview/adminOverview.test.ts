import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import { useAdminOverviewStore } from "@/features/admin/overview/adminOverview";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

function setup() {
  const session = useAdminSessionStore();
  const getJson = vi.fn();
  // The store keeps the api helpers it was created with; replace them to observe the calls.
  Object.assign(session, { getJson });
  const overview = useAdminOverviewStore();
  return { ...overview, getJson };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

describe("useAdminOverviewStore", () => {
  it("loadOverview merges the response into the reactive overview", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({ gateway: { version: "1.2.3", uptimeSeconds: 42 } });
    await s.loadOverview();
    expect(s.getJson).toHaveBeenCalledWith("/api/admin/overview");
    expect(s.overview.gateway.version).toBe("1.2.3");
    expect(s.overview.sessions.limit).toBe(100);
  });
});
