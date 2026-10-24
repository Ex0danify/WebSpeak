import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAdminStores } from "@/features/admin/adminStores";
import { createAdminFormat } from "@/features/admin/adminFormat";
import { useAdminFeedbackStore } from "@/features/admin/adminFeedback";
import { useAdminOverviewStore } from "@/features/admin/adminOverview";
import { useAdminServerDialogStore } from "@/features/admin/adminServerDialog";
import { useAdminServersStore } from "@/features/admin/adminServers";
import { useAdminSessionStore } from "@/features/admin/adminSession";
import type { AdminServer } from "@/features/admin/adminTypes";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

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
  const feedback = useAdminFeedbackStore();
  const getJson = vi.fn();
  const sendJson = vi.fn();
  const notify = vi.fn();
  // The stores look these up on each other at call time, so replacing them observes the calls.
  Object.assign(admin, { getJson, sendJson, screen: "admin" });
  Object.assign(feedback, { notify });
  const loadOverview = vi.fn(async () => {});
  Object.assign(useAdminOverviewStore(), { loadOverview });
  return { st: useAdminServerDialogStore(), servers: useAdminServersStore(), admin, feedback, getJson, sendJson, notify, loadOverview };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
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
    expect(s.servers.servers).toEqual([server("new")]);
    expect(s.st.dialog).toMatchObject({ open: false, saving: false, error: "" });
    expect(s.notify).toHaveBeenCalledWith(t("serverAdded"));
    expect(s.sendJson).toHaveBeenLastCalledWith("/api/admin/servers/new/test", "POST", {});
    expect(s.servers.statusOf(s.servers.servers[0]!)).toBe("online");
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
    expect(s.servers.statusOf(s.servers.servers[0]!)).toBe("unreachable");
  });

  it("keeps the dialog open and says why when the gateway refuses", async () => {
    const s = setup();
    s.st.openAdd();
    s.sendJson.mockRejectedValue({ code: "SERVER_NAME_TAKEN" });
    await s.st.saveDialog();
    expect(s.st.dialog).toMatchObject({ open: true, saving: false, error: s.feedback.errorText("SERVER_NAME_TAKEN") });
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
