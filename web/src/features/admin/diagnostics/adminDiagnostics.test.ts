import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

function setup() {
  const admin = useAdminSessionStore();
  const getJson = vi.fn(async (url: string) => {
    if (url === "/api/admin/diagnostics")
      return {
        gateway: { version: "1.0", node: "v22", platform: "linux", arch: "x64" },
        database: { schemaVersion: 3 },
        sessions: { created: 7 },
      };
    if (url.startsWith("/api/admin/logs")) return { available: true, entries: [{ level: "INFO" }], sessions: [] };
    return { events: [{ event: "X", createdAt: "now" }] };
  });
  // The stores look these up on each other at call time, so replacing them observes the calls.
  Object.assign(admin, { getJson });
  return { store: useAdminDiagnosticsStore(), feedback: useAdminFeedbackStore(), getJson };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAdminDiagnosticsStore", () => {
  it("loadDiagnostics fills the facts and the logs and stops the loading flag", async () => {
    const s = setup();
    await s.store.loadDiagnostics();
    expect(s.store.diagnostics.facts).toEqual({
      version: "1.0",
      node: "v22",
      platform: "linux",
      arch: "x64",
      schemaVersion: 3,
      createdSessions: 7,
    });
    expect(s.store.diagnostics.logs.available).toBe(true);
    expect(s.getJson).not.toHaveBeenCalledWith(expect.stringContaining("/audit"));
    expect(s.store.diagnosticsLoading).toBe(false);
  });

  it("loadDiagnostics reports a failed request in the shared banner", async () => {
    const s = setup();
    s.getJson.mockRejectedValue({ code: "RATE_LIMITED" });
    await s.store.loadDiagnostics();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText("RATE_LIMITED"));
    expect(s.store.diagnosticsLoading).toBe(false);
  });

  it("downloadBackup saves the file and refreshes the page and the event log to show the backup event", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("db", { status: 200 })),
    );
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await s.store.downloadBackup();
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect(s.getJson).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/admin\/audit\?limit=/));
  });

  it("downloadBackup reports a failed download in the shared banner and does not refresh", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    await s.store.downloadBackup();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText(undefined));
    expect(s.feedback.errorMessage).not.toBe("");
    expect(s.getJson).not.toHaveBeenCalled();
  });

  it("reset empties the page for logout", async () => {
    const s = setup();
    await s.store.loadDiagnostics();
    s.store.reset();
    expect(s.store.diagnostics.logs.entries).toEqual([]);
    expect(s.store.diagnostics.facts.version).toBe("");
  });
});
