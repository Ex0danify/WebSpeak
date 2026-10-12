import { registerAdminStores } from "./adminStores";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminOperationsStore } from "./adminOperations";
import { useAdminSessionStore } from "./adminSession";
import { useAdminOverviewStore } from "./adminOverview";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

function setup() {
  const session = useAdminSessionStore();
  const getJson = vi.fn();
  const sendJson = vi.fn(async () => ({}));
  // The store keeps the api helpers it was created with; replace them to observe the calls.
  Object.assign(session, { getJson, sendJson });
  const loadOperations = vi.fn(async () => {});
  Object.assign(useAdminOperationsStore(), { loadOperations });
  const overview = useAdminOverviewStore();
  return { ...overview, session, getJson, sendJson, loadOperations };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

afterEach(() => vi.unstubAllGlobals());

describe("useAdminOverviewStore", () => {
  it("loadOverview merges the response into the reactive overview", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({ gateway: { version: "1.2.3", uptimeSeconds: 42 }, legacyConfigImported: true });
    await s.loadOverview();
    expect(s.getJson).toHaveBeenCalledWith("/api/admin/overview");
    expect(s.overview.gateway.version).toBe("1.2.3");
    expect(s.overview.legacyConfigImported).toBe(true);
    expect(s.overview.sessions.limit).toBe(100);
  });

  it("dismissLegacyNotice posts the dismissal and clears the flag", async () => {
    const s = setup();
    s.overview.legacyConfigImported = true;
    await s.dismissLegacyNotice();
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/legacy-import/dismiss", "POST", {});
    expect(s.overview.legacyConfigImported).toBe(false);
  });

  it("downloadBackup saves the file and refreshes operations", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("db", { status: 200 })),
    );
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await s.downloadBackup();
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect(s.loadOperations).toHaveBeenCalled();
    click.mockRestore();
  });

  it("downloadBackup reports a failed download in the shared banner", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    await s.downloadBackup();
    expect(s.session.errorMessage).toBe(s.session.errorText(undefined));
    expect(s.session.errorMessage).not.toBe("");
    expect(s.loadOperations).not.toHaveBeenCalled();
  });
});
