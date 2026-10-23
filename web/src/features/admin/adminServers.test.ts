import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAdminStores } from "@/features/admin/adminStores";
import { createAdminFormat } from "@/features/admin/adminFormat";
import { useAdminOverviewStore } from "@/features/admin/adminOverview";
import { useAdminServersStore } from "@/features/admin/adminServers";
import { useAdminSessionStore } from "@/features/admin/adminSession";
import type { AdminServer } from "@/features/admin/adminTypes";
import { useDialogQueue } from "@/shared/composables/useDialog";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

// The store asks through the shared dialog queue, so a test answers the one it raised.
async function answerDialog(value: boolean) {
  await Promise.resolve();
  const { current, settle } = useDialogQueue();
  if (current.value) settle(current.value.id, value);
}

const { language, t } = useI18n();
const { connectionFailureText } = createAdminFormat(language, t);

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
  const getJson = vi.fn();
  const sendJson = vi.fn();
  const notify = vi.fn();
  // The stores look these up on each other at call time, so replacing them observes the calls.
  Object.assign(admin, { getJson, sendJson, notify, screen: "admin" });
  const loadOverview = vi.fn(async () => {});
  Object.assign(useAdminOverviewStore(), { loadOverview });
  return { st: useAdminServersStore(), admin, getJson, sendJson, notify, loadOverview };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

describe("server status", () => {
  it("shows the stored test result until a probe has run", () => {
    const s = setup();
    expect(s.st.statusOf(server("a"))).toBe("probing");
    expect(s.st.statusOf(server("a", { lastTestAt: "2026-01-01T00:00:00Z" }))).toBe("online");
    expect(s.st.statusOf(server("a", { lastTestAt: "2026-01-01T00:00:00Z", lastTestError: "TIMEOUT" }))).toBe("unreachable");
  });

  it("loadServers reads the list", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({ servers: [server("a")] });
    await s.st.loadServers();
    expect(s.getJson).toHaveBeenCalledWith("/api/admin/servers");
    expect(s.st.servers).toEqual([server("a")]);
  });

  it("probeAll checks the servers one after the other and then refreshes the overview", async () => {
    const s = setup();
    s.st.servers = [server("a"), server("b"), server("c")];
    let running = 0;
    let peak = 0;
    s.sendJson.mockImplementation(async (url: string) => {
      running++;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running--;
      return { ok: !url.includes("/b/") };
    });
    await s.st.probeAll();
    expect(s.sendJson.mock.calls.map((call) => call[0])).toEqual([
      "/api/admin/servers/a/test",
      "/api/admin/servers/b/test",
      "/api/admin/servers/c/test",
    ]);
    expect(peak).toBe(1);
    expect(s.st.servers.map((entry) => s.st.statusOf(entry))).toEqual(["online", "unreachable", "online"]);
    expect(s.loadOverview).toHaveBeenCalledTimes(1);
  });

  it("shows a server as probing while its test runs, and a failed request as unreachable", async () => {
    const s = setup();
    s.st.servers = [server("a")];
    let finish: (value: unknown) => void = () => {};
    s.sendJson.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const pending = s.st.probeAll();
    expect(s.st.statusOf(s.st.servers[0]!)).toBe("probing");
    finish({ ok: true });
    await pending;
    expect(s.st.statusOf(s.st.servers[0]!)).toBe("online");

    s.sendJson.mockRejectedValue({ code: "TIMEOUT" });
    await s.st.probeAll();
    expect(s.st.statusOf(s.st.servers[0]!)).toBe("unreachable");
  });

  it("a pass that was overtaken stops probing", async () => {
    const s = setup();
    s.st.servers = [server("a"), server("b")];
    s.sendJson.mockImplementation(async () => {
      s.st.reset();
      return { ok: true };
    });
    await s.st.probeAll();
    expect(s.sendJson).toHaveBeenCalledTimes(1);
    expect(s.loadOverview).not.toHaveBeenCalled();
  });
});

describe("the add and edit dialog", () => {
  it("opens empty for a new server", () => {
    const s = setup();
    s.st.dialog.name = "left over";
    s.st.openAdd();
    expect(s.st.dialog).toMatchObject({ open: true, id: "", name: "", address: "", port: "9987", passwordAction: "replace" });
    expect(s.st.dialogTitle).toBe(t("addServer"));
  });

  it("opens an existing server split into address and port, keeping its password", () => {
    const s = setup();
    s.st.openEdit(server("a", { name: "Home", target: "[2001:db8::1]:9988", hasPassword: true }));
    expect(s.st.dialog).toMatchObject({
      open: true,
      id: "a",
      name: "Home",
      address: "2001:db8::1",
      port: "9988",
      hasPassword: true,
      passwordAction: "keep",
    });
    expect(s.st.dialogTitle).toBe(t("editServer"));
  });

  it("adds a server, announces it and checks it", async () => {
    const s = setup();
    s.st.openAdd();
    Object.assign(s.st.dialog, { name: "Clan", address: "clan.example.org", port: "9988", serverPassword: "pw" });
    s.sendJson.mockImplementation(async (url: string) =>
      url.endsWith("/test") ? { ok: true } : { server: server("new"), servers: [server("new")] },
    );
    await s.st.saveDialog();
    expect(s.sendJson).toHaveBeenNthCalledWith(1, "/api/admin/servers", "POST", {
      name: "Clan",
      target: "clan.example.org:9988",
      passwordAction: "replace",
      serverPassword: "pw",
    });
    expect(s.st.servers).toEqual([server("new")]);
    expect(s.st.dialog).toMatchObject({ open: false, saving: false, error: "" });
    expect(s.notify).toHaveBeenCalledWith(t("serverAdded"));
    expect(s.sendJson).toHaveBeenLastCalledWith("/api/admin/servers/new/test", "POST", {});
    expect(s.st.statusOf(s.st.servers[0]!)).toBe("online");
    expect(s.loadOverview).toHaveBeenCalled();
  });

  it("saves a change without sending a password it is not replacing", async () => {
    const s = setup();
    s.st.openEdit(server("a", { hasPassword: true }));
    s.st.dialog.serverPassword = "stale";
    s.sendJson.mockImplementation(async (url: string) =>
      url.endsWith("/test") ? { ok: false } : { server: server("a"), servers: [server("a")] },
    );
    await s.st.saveDialog();
    expect(s.sendJson).toHaveBeenNthCalledWith(1, "/api/admin/servers/a", "PUT", {
      name: "a",
      target: "a.example.org:9987",
      passwordAction: "keep",
    });
    expect(s.notify).toHaveBeenCalledWith(t("serverSaved"));
    expect(s.st.statusOf(s.st.servers[0]!)).toBe("unreachable");
  });

  it("keeps the dialog open and says why when the gateway refuses", async () => {
    const s = setup();
    s.st.openAdd();
    s.sendJson.mockRejectedValue({ code: "SERVER_NAME_TAKEN" });
    await s.st.saveDialog();
    expect(s.st.dialog).toMatchObject({ open: true, saving: false, error: s.admin.errorText("SERVER_NAME_TAKEN") });
    expect(s.notify).not.toHaveBeenCalled();
  });
});

describe("removing a server", () => {
  it("asks first and does nothing when declined", async () => {
    const s = setup();
    s.st.servers = [server("a")];
    const removal = s.st.removeServer(s.st.servers[0]!);
    await answerDialog(false);
    await removal;
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.st.servers).toHaveLength(1);
  });

  it("removes it once confirmed and announces it", async () => {
    const s = setup();
    s.st.servers = [server("a", { name: "Home" }), server("b")];
    s.sendJson.mockResolvedValue({ servers: [server("b")] });
    const removal = s.st.removeServer(s.st.servers[0]!);
    await answerDialog(true);
    await removal;
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/servers/a", "DELETE", {});
    expect(s.st.servers).toEqual([server("b")]);
    expect(s.notify).toHaveBeenCalledWith(t("serverRemoved", { name: "Home" }));
    expect(s.loadOverview).toHaveBeenCalled();
  });

  it("shows a refusal in the page banner and keeps the list", async () => {
    const s = setup();
    s.st.servers = [server("a")];
    s.sendJson.mockRejectedValue({ code: "SERVERS_REQUIRED" });
    const removal = s.st.removeServer(s.st.servers[0]!);
    await answerDialog(true);
    await removal;
    expect(s.admin.errorMessage).toBe(s.admin.errorText("SERVERS_REQUIRED"));
    expect(s.st.servers).toHaveLength(1);
    expect(s.notify).not.toHaveBeenCalled();
  });
});

describe("testing the address in the dialog", () => {
  it("sends only the address and shows the answer", async () => {
    const s = setup();
    s.st.openAdd();
    Object.assign(s.st.dialog, { address: "probe.example.org", port: "9988", serverPassword: "typed" });
    s.sendJson.mockResolvedValue({
      ok: true,
      latencyMs: 12,
      hostPing: { ok: true, latencyMs: 3, packetLossPercent: 0, attempts: 4, successfulAttempts: 4 },
    });
    await s.st.testDialogConnection();
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/server/test", "POST", { target: "probe.example.org:9988" });
    expect(s.st.testResultTitle).toBe(t("serverAnswered"));
    expect(s.st.testResultText).toContain("12 ms");
    expect(s.st.testing).toBe(false);
  });

  it("turns a thrown error into a failed result", async () => {
    const s = setup();
    s.sendJson.mockRejectedValue({ code: "TIMEOUT" });
    await s.st.testDialogConnection();
    expect(s.st.testResult).toEqual({ ok: false, code: "TIMEOUT" });
    expect(s.st.testResultText).toContain(connectionFailureText("TIMEOUT"));
  });

  it("forgets the previous answer when the dialog opens again", () => {
    const s = setup();
    s.st.testResult = { ok: true };
    s.st.openAdd();
    expect(s.st.testResult).toBeNull();
  });
});

describe("reordering", () => {
  const ids = (s: ReturnType<typeof setup>) => s.st.servers.map((entry) => entry.id);

  it("moves the picked up server locally and saves the order once it is dropped", async () => {
    const s = setup();
    s.st.servers = [server("a"), server("b"), server("c")];
    s.st.grabServer("a");
    s.st.shiftGrabbed(1);
    s.st.shiftGrabbed(1);
    expect(ids(s)).toEqual(["b", "c", "a"]);
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.st.announcement).toBe(t("serverMoved", { name: "a", position: 3, total: 3 }));
    s.sendJson.mockResolvedValue({ servers: [server("b"), server("c"), server("a")] });
    await s.st.dropServer();
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/servers/order", "PUT", { ids: ["b", "c", "a"] });
    expect(s.notify).toHaveBeenCalledWith(t("serverOrderSaved"));
    expect(s.st.grabbed).toBe("");
  });

  it("stays inside the list and saves nothing when the order did not change", async () => {
    const s = setup();
    s.st.servers = [server("a"), server("b")];
    s.st.grabServer("a");
    s.st.shiftGrabbed(-1);
    s.st.shiftGrabbed(1);
    s.st.shiftGrabbed(-1);
    await s.st.dropServer();
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.notify).not.toHaveBeenCalled();
  });

  it("puts the old order back when cancelled", () => {
    const s = setup();
    s.st.servers = [server("a"), server("b")];
    s.st.grabServer("b");
    s.st.moveGrabbedTo(0);
    expect(ids(s)).toEqual(["b", "a"]);
    s.st.cancelGrab();
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.st.grabbed).toBe("");
    expect(s.st.announcement).toBe(t("serverMoveCancelled", { name: "b" }));
  });

  it("goes back to the old order and shows the reason when the gateway refuses", async () => {
    const s = setup();
    s.st.servers = [server("a"), server("b")];
    s.st.grabServer("a");
    s.st.shiftGrabbed(1);
    s.sendJson.mockRejectedValue({ code: "INVALID_SERVER_ORDER" });
    await s.st.dropServer();
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.admin.errorMessage).toBe(s.admin.errorText("INVALID_SERVER_ORDER"));
    expect(s.notify).not.toHaveBeenCalled();
  });

  it("holds one server at a time", () => {
    const s = setup();
    s.st.servers = [server("a"), server("b")];
    s.st.grabServer("a");
    s.st.grabServer("b");
    expect(s.st.grabbed).toBe("a");
  });
});
