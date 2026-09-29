import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "../i18n/use-i18n";
import { useAdminOperationsStore } from "./adminOperations";
import { useAdminOverviewStore } from "./adminOverview";
import { useAdminSessionStore } from "./adminSession";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const { t } = useI18n();

function setup() {
  const admin = useAdminSessionStore();
  const getJson = vi.fn();
  const sendJson = vi.fn(async () => ({}));
  const notify = vi.fn();
  // The stores look these up on each other at call time, so replacing them observes the calls.
  Object.assign(admin, { getJson, sendJson, notify });
  const loadOverview = vi.fn(async () => {});
  Object.assign(useAdminOverviewStore(), { loadOverview });
  return { ops: useAdminOperationsStore(), admin, getJson, sendJson, loadOverview, notify };
}

beforeEach(() => setActivePinia(createPinia()));

function answerAll(getJson: ReturnType<typeof vi.fn>) {
  getJson.mockImplementation(async (url: string) => {
    if (url === "/api/admin/sessions") return { sessions: [{ id: "s1", nickname: "Ann" }] };
    if (url === "/api/admin/invites") return { invites: [{ id: "i1" }] };
    if (url === "/api/admin/diagnostics") return { gateway: { version: "1.0", node: "v22", platform: "linux", arch: "x64" }, database: { schemaVersion: 3 }, sessions: { created: 7 } };
    if (url.startsWith("/api/admin/logs")) return { available: true, entries: [{ level: "INFO" }], sessions: [] };
    return { events: [{ event: "X", createdAt: "now" }] };
  });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("useAdminOperationsStore", () => {
  it("loadOperations fills every section and stops the loading flag", async () => {
    const s = setup();
    answerAll(s.getJson);
    await s.ops.loadOperations();
    expect(s.ops.operations.sessions).toHaveLength(1);
    expect(s.ops.operations.invites).toHaveLength(1);
    expect(s.ops.operations.diagnostics).toEqual({ version: "1.0", node: "v22", platform: "linux", arch: "x64", schemaVersion: 3, createdSessions: 7 });
    expect(s.ops.operations.logs.available).toBe(true);
    expect(s.ops.operations.audit).toHaveLength(1);
    expect(s.ops.operationsLoading).toBe(false);
  });

  it("loadOperations reports a failed request in the shared banner", async () => {
    const s = setup();
    s.getJson.mockRejectedValue({ code: "RATE_LIMITED" });
    await s.ops.loadOperations();
    expect(s.admin.errorMessage).toBe(s.admin.errorText("RATE_LIMITED"));
    expect(s.ops.operationsLoading).toBe(false);
  });

  it("terminateSession does nothing when the confirmation is declined", async () => {
    const s = setup();
    vi.stubGlobal("confirm", vi.fn(() => false));
    await s.ops.terminateSession({ id: "s1", nickname: "Ann" } as never);
    expect(s.sendJson).not.toHaveBeenCalled();
  });

  it("terminateSession posts, refreshes operations and overview, then notifies", async () => {
    const s = setup();
    answerAll(s.getJson);
    vi.stubGlobal("confirm", vi.fn(() => true));
    await s.ops.terminateSession({ id: "a/b", nickname: "Ann" } as never);
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/sessions/a%2Fb/terminate", "POST", {});
    expect(s.loadOverview).toHaveBeenCalled();
    expect(s.notify).toHaveBeenCalledWith(t("sessionTerminated"));
    expect(s.ops.terminatingSession).toBe("");
  });

  it("createInvite builds the link from the token and clears the channel", async () => {
    const s = setup();
    answerAll(s.getJson);
    s.sendJson.mockResolvedValue({ token: "t k" } as never);
    s.ops.inviteForm.channel = "Lobby";
    await s.ops.createInvite();
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/invites", "POST", { channel: "Lobby", expiresInHours: 24, maxUses: 0 });
    expect(s.ops.createdInvite?.link).toBe(`${location.origin}/?invite=t%20k`);
    expect(s.ops.inviteForm.channel).toBe("");
    expect(s.admin.submitting).toBe(false);
  });

  it("createInvite fails when the response carries no token", async () => {
    const s = setup();
    await s.ops.createInvite();
    expect(s.ops.createdInvite).toBeNull();
    expect(s.admin.errorMessage).toBe(s.admin.errorText(undefined));
    expect(s.admin.submitting).toBe(false);
  });

  it("revokeInvite only acts after confirmation", async () => {
    const s = setup();
    answerAll(s.getJson);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    await s.ops.revokeInvite({ id: "i1" } as never);
    expect(s.sendJson).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await s.ops.revokeInvite({ id: "i1" } as never);
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/invites/i1/revoke", "POST", {});
    expect(s.notify).toHaveBeenCalledWith(t("inviteRevoked"));
  });

  it("copyInviteLink copies the link, and reports a clipboard failure", async () => {
    const s = setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await s.ops.copyInviteLink();
    expect(writeText).not.toHaveBeenCalled();
    s.ops.createdInvite = { token: "t", link: "http://x/?invite=t" };
    await s.ops.copyInviteLink();
    expect(writeText).toHaveBeenCalledWith("http://x/?invite=t");
    expect(s.notify).toHaveBeenCalledWith(t("copiedLink"));
    writeText.mockRejectedValue(new Error("denied"));
    await s.ops.copyInviteLink();
    expect(s.admin.errorMessage).toBe(t("operationFailed"));
  });
});
