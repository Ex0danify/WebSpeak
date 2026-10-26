import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useI18n } from "@/shared/i18n/useI18n";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminUsersStore } from "@/features/admin/users/adminUsers";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
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
  return { store: useAdminUsersStore(), admin, feedback, getJson, sendJson, loadOverview, notify };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

function answerAll(getJson: Mock<(url: string) => Promise<unknown>>) {
  getJson.mockImplementation(async (url: string) => {
    if (url === "/api/admin/sessions") return { sessions: [{ id: "s1", nickname: "Ann" }] };
    if (url === "/api/admin/invites") return { invites: [{ id: "i1" }] };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAdminUsersStore", () => {
  it("loadUsers fills the sessions and the invites and stops the loading flag", async () => {
    const s = setup();
    answerAll(s.getJson);
    await s.store.loadUsers();
    expect(s.store.users.sessions).toHaveLength(1);
    expect(s.store.users.invites).toHaveLength(1);
    expect(s.store.usersLoading).toBe(false);
  });

  it("loadUsers reports a failed request in the shared banner", async () => {
    const s = setup();
    s.getJson.mockRejectedValue({ code: "RATE_LIMITED" });
    await s.store.loadUsers();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText("RATE_LIMITED"));
    expect(s.store.usersLoading).toBe(false);
  });

  it("terminateSession does nothing when the confirmation is declined", async () => {
    const s = setup();
    const done = s.store.terminateSession({ id: "s1", nickname: "Ann" } as never);
    await answerDialog(false);
    await done;
    expect(s.sendJson).not.toHaveBeenCalled();
  });

  it("terminateSession posts, refreshes the users and the overview, then notifies", async () => {
    const s = setup();
    answerAll(s.getJson);
    const done = s.store.terminateSession({ id: "a/b", nickname: "Ann" } as never);
    await answerDialog(true);
    await done;
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/sessions/a%2Fb/terminate", "POST", {});
    expect(s.loadOverview).toHaveBeenCalled();
    expect(s.notify).toHaveBeenCalledWith(t("sessionTerminated"));
    expect(s.store.terminatingSession).toBe("");
  });

  it("createInvite builds the link from the token and clears the channel", async () => {
    const s = setup();
    answerAll(s.getJson);
    s.sendJson.mockResolvedValue({ token: "t k" } as never);
    s.store.inviteForm.channel = "Lobby";
    await s.store.createInvite();
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/invites", "POST", {
      serverId: "",
      channel: "Lobby",
      expiresInHours: 24,
      maxUses: 0,
    });
    expect(s.store.createdInvite?.link).toBe(`${location.origin}/?invite=t%20k`);
    expect(s.store.inviteForm.channel).toBe("");
    expect(s.store.creatingInvite).toBe(false);
  });

  it("createInvite fails when the response carries no token", async () => {
    const s = setup();
    await s.store.createInvite();
    expect(s.store.createdInvite).toBeNull();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText(undefined));
    expect(s.store.creatingInvite).toBe(false);
  });

  it("revokeInvite only acts after confirmation", async () => {
    const s = setup();
    answerAll(s.getJson);
    const declined = s.store.revokeInvite({ id: "i1" } as never);
    await answerDialog(false);
    await declined;
    expect(s.sendJson).not.toHaveBeenCalled();
    const accepted = s.store.revokeInvite({ id: "i1" } as never);
    await answerDialog(true);
    await accepted;
    expect(s.sendJson).toHaveBeenCalledWith("/api/admin/invites/i1/revoke", "POST", {});
    expect(s.notify).toHaveBeenCalledWith(t("inviteRevoked"));
  });

  it("copyInviteLink copies the link, and reports a clipboard failure", async () => {
    const s = setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await s.store.copyInviteLink();
    expect(writeText).not.toHaveBeenCalled();
    s.store.createdInvite = { token: "t", link: "http://x/?invite=t" };
    await s.store.copyInviteLink();
    expect(writeText).toHaveBeenCalledWith("http://x/?invite=t");
    expect(s.notify).toHaveBeenCalledWith(t("copiedLink"));
    writeText.mockRejectedValue(new Error("denied"));
    await s.store.copyInviteLink();
    expect(s.feedback.errorMessage).toBe(t("operationFailed"));
  });
});
