import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminOverviewStore } from "@/features/admin/overview/adminOverview";
import { useAdminServersStore } from "@/features/admin/server/adminServers";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import type { AdminServer } from "@/features/admin/core/adminTypes";
import { useDialogQueue } from "@/shared/composables/useDialog";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

// The store asks through the shared dialog queue, so a test answers the one it raised.
async function answerDialog(value: boolean) {
  await Promise.resolve();
  const { current, settle } = useDialogQueue();
  if (current.value) settle(current.value.id, value);
}

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
  return { st: useAdminServersStore(), admin, feedback, getJson, sendJson, notify, loadOverview };
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
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText("SERVERS_REQUIRED"));
    expect(s.st.servers).toHaveLength(1);
    expect(s.notify).not.toHaveBeenCalled();
  });
});
