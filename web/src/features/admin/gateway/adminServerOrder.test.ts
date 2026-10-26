import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import { useAdminServerOrderStore } from "@/features/admin/gateway/adminServerOrder";
import { useAdminServersStore } from "@/features/admin/gateway/adminServers";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import type { AdminServer } from "@/features/admin/core/adminTypes";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const { t } = useI18n();

const server = (id: string, overrides: Partial<AdminServer> = {}): AdminServer => ({
  id,
  name: id,
  target: `${id}.example.org:9987`,
  hasPassword: false,
  lastTestAt: null,
  lastTestLatencyMs: null,
  lastTestError: null,
  ...overrides,
});

function setup() {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const getJson = vi.fn();
  const sendJson = vi.fn();
  const notify = vi.fn();
  // The stores look these up on each other at call time, so replacing them observes the calls.
  Object.assign(admin, { getJson, sendJson, screen: "admin" });
  Object.assign(feedback, { notify });
  const loadOverview = vi.fn(async () => {});
  Object.assign(useAdminOverviewStore(), { loadOverview });
  return { st: useAdminServerOrderStore(), servers: useAdminServersStore(), admin, feedback, getJson, sendJson, notify, loadOverview };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

describe("reordering", () => {
  const ids = (s: ReturnType<typeof setup>) => s.servers.servers.map((entry) => entry.id);

  it("moves the picked up server locally and saves the order once it is dropped", async () => {
    const s = setup();
    s.servers.servers = [server("a"), server("b"), server("c")];
    s.st.grabServer("a");
    s.st.shiftGrabbed(1);
    s.st.shiftGrabbed(1);
    expect(ids(s)).toEqual(["b", "c", "a"]);
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.st.announcement).toBe(t("serverMoved", { name: "a", position: 3, total: 3 }));
    s.sendJson.mockResolvedValue({ servers: [server("b"), server("c"), server("a")] });
    await s.st.dropServer();
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/servers/order", "PUT", { ids: ["b", "c", "a"] });
    expect(s.feedback.statusOf("servers").state).toBe("saved");
    expect(s.st.grabbed).toBe("");
  });

  it("stays inside the list and saves nothing when the order did not change", async () => {
    const s = setup();
    s.servers.servers = [server("a"), server("b")];
    s.st.grabServer("a");
    s.st.shiftGrabbed(-1);
    s.st.shiftGrabbed(1);
    s.st.shiftGrabbed(-1);
    await s.st.dropServer();
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.feedback.statusOf("servers").state).toBe("idle");
  });

  it("puts the old order back when cancelled", () => {
    const s = setup();
    s.servers.servers = [server("a"), server("b")];
    s.st.grabServer("b");
    s.st.moveGrabbedTo(0);
    expect(ids(s)).toEqual(["b", "a"]);
    s.st.cancelGrab();
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.st.grabbed).toBe("");
    expect(s.st.announcement).toBe(t("serverMoveCancelled", { name: "b" }));
  });

  it("goes back to the old order and shows the reason in the list when the gateway refuses", async () => {
    const s = setup();
    s.servers.servers = [server("a"), server("b")];
    s.st.grabServer("a");
    s.st.shiftGrabbed(1);
    s.sendJson.mockRejectedValue({ code: "INVALID_SERVER_ORDER" });
    await s.st.dropServer();
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.feedback.statusOf("servers").error).toBe(s.feedback.errorText("INVALID_SERVER_ORDER"));
    expect(s.feedback.errorMessage).toBe("");
  });

  it("holds one server at a time", () => {
    const s = setup();
    s.servers.servers = [server("a"), server("b")];
    s.st.grabServer("a");
    s.st.grabServer("b");
    expect(s.st.grabbed).toBe("a");
  });
});
