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
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAdminUsersStore", () => {
  it("loadSessions fills the sessions and stops the loading flag", async () => {
    const s = setup();
    answerAll(s.getJson);
    await s.store.loadSessions();
    expect(s.store.users.sessions).toHaveLength(1);
    expect(s.store.sessionsLoading).toBe(false);
  });

  it("loadSessions reports a failed request in the shared banner", async () => {
    const s = setup();
    s.getJson.mockRejectedValue({ code: "RATE_LIMITED" });
    await s.store.loadSessions();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText("RATE_LIMITED"));
    expect(s.store.sessionsLoading).toBe(false);
  });

  it("loadSessions(true) refreshes without the spinner and keeps quiet when it fails", async () => {
    const s = setup();
    s.getJson.mockResolvedValueOnce({ sessions: [{ id: "s1" }] });
    const pending = s.store.loadSessions(true);
    expect(s.store.sessionsLoading).toBe(false);
    await pending;
    expect(s.store.users.sessions).toEqual([{ id: "s1" }]);
    s.getJson.mockRejectedValueOnce({ code: "RATE_LIMITED" });
    await s.store.loadSessions(true);
    expect(s.feedback.errorMessage).toBe("");
    expect(s.store.users.sessions).toEqual([{ id: "s1" }]);
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
    // The event log and the connection history show the termination at once.
    expect(s.getJson).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/admin\/audit\?/));
    expect(s.getJson).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/admin\/connections\?/));
    expect(s.notify).toHaveBeenCalledWith(t("sessionTerminated"));
    expect(s.store.terminatingSession).toBe("");
  });
});
