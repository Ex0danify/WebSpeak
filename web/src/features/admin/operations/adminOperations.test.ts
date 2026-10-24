import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useI18n } from "@/shared/i18n/useI18n";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminOperationsStore } from "@/features/admin/operations/adminOperations";
import { useAdminOverviewStore } from "@/features/admin/overview/adminOverview";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import { useDialogQueue } from "@/shared/composables/useDialog";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const { t } = useI18n();

// The store asks through the shared dialog queue, so a test answers the one it raised. The store is pre-imported by the test
// setup, so module-mocking useDialog would land too late; driving the real queue is what the app does anyway.
async function answerDialog(value: boolean) {
  await Promise.resolve();
  const { current, settle } = useDialogQueue();
  if (current.value) settle(current.value.id, value);
}

function setup() {
  const admin = useAdminSessionStore();
  const getJson = vi.fn();
  const sendJson = vi.fn(async () => ({}));
  const notify = vi.fn();
  const feedback = useAdminFeedbackStore();
  // The stores look these up on each other at call time, so replacing them observes the calls.
  Object.assign(admin, { getJson, sendJson });
  Object.assign(feedback, { notify });
  const loadOverview = vi.fn(async () => {});
  Object.assign(useAdminOverviewStore(), { loadOverview });
  return { ops: useAdminOperationsStore(), admin, feedback, getJson, sendJson, loadOverview, notify };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

function answerAll(getJson: Mock<(url: string) => Promise<unknown>>) {
  getJson.mockImplementation(async (url: string) => {
    if (url === "/api/admin/sessions") return { sessions: [{ id: "s1", nickname: "Ann" }] };
    if (url === "/api/admin/invites") return { invites: [{ id: "i1" }] };
    if (url === "/api/admin/diagnostics")
      return {
        gateway: { version: "1.0", node: "v22", platform: "linux", arch: "x64" },
        database: { schemaVersion: 3 },
        sessions: { created: 7 },
      };
    if (url.startsWith("/api/admin/logs")) return { available: true, entries: [{ level: "INFO" }], sessions: [] };
    return { events: [{ event: "X", createdAt: "now" }] };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAdminOperationsStore", () => {
  it("loadOperations fills every section and stops the loading flag", async () => {
    const s = setup();
    answerAll(s.getJson);
    await s.ops.loadOperations();
    expect(s.ops.operations.sessions).toHaveLength(1);
    expect(s.ops.operations.invites).toHaveLength(1);
    expect(s.ops.operations.diagnostics).toEqual({
      version: "1.0",
      node: "v22",
      platform: "linux",
      arch: "x64",
      schemaVersion: 3,
      createdSessions: 7,
    });
    expect(s.ops.operations.logs.available).toBe(true);
    expect(s.ops.operations.audit).toHaveLength(1);
    expect(s.ops.operationsLoading).toBe(false);
  });

  it("loadOperations reports a failed request in the shared banner", async () => {
    const s = setup();
    s.getJson.mockRejectedValue({ code: "RATE_LIMITED" });
    await s.ops.loadOperations();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText("RATE_LIMITED"));
    expect(s.ops.operationsLoading).toBe(false);
  });

  it("terminateSession does nothing when the confirmation is declined", async () => {
    const s = setup();
    const done = s.ops.terminateSession({ id: "s1", nickname: "Ann" } as never);
    await answerDialog(false);
    await done;
    expect(s.sendJson).not.toHaveBeenCalled();
  });

  it("terminateSession posts, refreshes operations and overview, then notifies", async () => {
    const s = setup();
    answerAll(s.getJson);
    const done = s.ops.terminateSession({ id: "a/b", nickname: "Ann" } as never);
    await answerDialog(true);
    await done;
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
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/invites", "POST", {
      serverId: "",
      channel: "Lobby",
      expiresInHours: 24,
      maxUses: 0,
    });
    expect(s.ops.createdInvite?.link).toBe(`${location.origin}/?invite=t%20k`);
    expect(s.ops.inviteForm.channel).toBe("");
    expect(s.ops.creatingInvite).toBe(false);
  });

  it("createInvite fails when the response carries no token", async () => {
    const s = setup();
    await s.ops.createInvite();
    expect(s.ops.createdInvite).toBeNull();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText(undefined));
    expect(s.ops.creatingInvite).toBe(false);
  });

  it("revokeInvite only acts after confirmation", async () => {
    const s = setup();
    answerAll(s.getJson);
    const declined = s.ops.revokeInvite({ id: "i1" } as never);
    await answerDialog(false);
    await declined;
    expect(s.sendJson).not.toHaveBeenCalled();
    const accepted = s.ops.revokeInvite({ id: "i1" } as never);
    await answerDialog(true);
    await accepted;
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
    expect(s.feedback.errorMessage).toBe(t("operationFailed"));
  });

  it("downloadBackup saves the file and refreshes the page to show the audit event", async () => {
    const s = setup();
    answerAll(s.getJson);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("db", { status: 200 })),
    );
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await s.ops.downloadBackup();
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect(s.getJson).toHaveBeenCalledWith("/api/admin/audit?limit=50");
  });

  it("downloadBackup reports a failed download in the shared banner and does not refresh", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    await s.ops.downloadBackup();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText(undefined));
    expect(s.feedback.errorMessage).not.toBe("");
    expect(s.getJson).not.toHaveBeenCalled();
  });
});
