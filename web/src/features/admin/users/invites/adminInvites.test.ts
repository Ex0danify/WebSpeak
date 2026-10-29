import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/i18n/useI18n";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import { INVITE_PAGE_SIZE, INVITE_PREVIEW, useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";
import { useDialogQueue } from "@/shared/composables/useDialog";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const { t } = useI18n();

// The store asks through the shared dialog queue, so a test answers the one it raised.
async function answerDialog(value: boolean) {
  await Promise.resolve();
  const { current, settle } = useDialogQueue();
  if (current.value) settle(current.value.id, value);
}

function setup() {
  const admin = useAdminSessionStore();
  const getJson = vi.fn<(url: string) => Promise<Record<string, unknown>>>(async () => ({ invites: [{ id: "i1" }], total: 1 }));
  const sendJson = vi.fn(async () => ({}));
  const notify = vi.fn();
  const feedback = useAdminFeedbackStore();
  Object.assign(admin, { getJson, sendJson });
  Object.assign(feedback, { notify });
  return { store: useAdminInvitesStore(), feedback, getJson, sendJson, notify };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the invite list", () => {
  it("showPreview asks for the newest few and keeps the total", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({ invites: [{ id: "i1" }], total: 30 });
    await s.store.showPreview();
    expect(s.getJson).toHaveBeenCalledWith(`/api/admin/invites?limit=${INVITE_PREVIEW}&offset=0`);
    expect(s.store.list.items).toHaveLength(1);
    expect(s.store.list.total).toBe(30);
    expect(s.store.list.loading).toBe(false);
  });

  it("pages and filters by status, and a filter starts again at the first page", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({ invites: [], total: 60 });
    await s.store.showPages();
    expect(s.store.pageCount).toBe(3);
    await s.store.goToPage(3);
    expect(s.getJson).toHaveBeenLastCalledWith(`/api/admin/invites?limit=${INVITE_PAGE_SIZE}&offset=${2 * INVITE_PAGE_SIZE}`);
    await s.store.goToPage(9);
    expect(s.store.list.page).toBe(3);
    await s.store.filterByStatus("revoked");
    expect(s.store.list.page).toBe(1);
    expect(s.getJson).toHaveBeenLastCalledWith(`/api/admin/invites?limit=${INVITE_PAGE_SIZE}&offset=0&status=revoked`);
  });

  it("falls back to an empty list when the answer has no invites", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({});
    await s.store.showPreview();
    expect(s.store.list.items).toEqual([]);
    expect(s.store.list.total).toBe(0);
  });

  it("reports a failed request in the shared banner", async () => {
    const s = setup();
    s.getJson.mockRejectedValue({ code: "RATE_LIMITED" });
    await s.store.showPreview();
    expect(s.feedback.errorMessage).toBe(s.feedback.errorText("RATE_LIMITED"));
    expect(s.store.list.loading).toBe(false);
  });

  it("goes back a page when a change leaves the last page empty", async () => {
    const s = setup();
    s.getJson.mockResolvedValueOnce({ invites: [{ id: "i26" }], total: 26 });
    await s.store.showPages();
    await s.store.goToPage(2);
    s.getJson.mockResolvedValueOnce({ invites: [], total: 25 }).mockResolvedValueOnce({ invites: [{ id: "i1" }], total: 25 });
    const revoked = s.store.revokeInvite({ id: "i26" } as never);
    await answerDialog(true);
    await revoked;
    expect(s.store.list.page).toBe(1);
    expect(s.store.list.items).toEqual([{ id: "i1" }]);
  });
});

describe("creating and revoking", () => {
  it("openCreateInvite opens the dialog with a fresh form for the same server", () => {
    const s = setup();
    s.store.inviteForm.serverId = "srv";
    s.store.inviteForm.channel = "Old";
    s.store.inviteForm.maxUses = 5;
    s.store.createdInvite = { token: "t", link: "l" };
    s.store.inviteError = "boom";
    s.store.openCreateInvite();
    expect(s.store.inviteDialogOpen).toBe(true);
    expect(s.store.inviteForm).toEqual({ serverId: "srv", channel: "", expiresInHours: 24, maxUses: 0 });
    expect(s.store.createdInvite).toBeNull();
    expect(s.store.inviteError).toBe("");
  });

  it("createInvite builds the link from the token and reloads the list", async () => {
    const s = setup();
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
    expect(s.getJson).toHaveBeenCalled();
    expect(s.store.creatingInvite).toBe(false);
  });

  it("createInvite fails when the response carries no token, and says so in the dialog", async () => {
    const s = setup();
    await s.store.createInvite();
    expect(s.store.createdInvite).toBeNull();
    expect(s.store.inviteError).toBe(s.feedback.errorText(undefined));
    expect(s.feedback.errorMessage).toBe("");
    expect(s.store.creatingInvite).toBe(false);
  });

  it("revokeInvite only acts after confirmation", async () => {
    const s = setup();
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

  it("reset forgets the list, the form and the dialog", async () => {
    const s = setup();
    await s.store.showPreview();
    s.store.createdInvite = { token: "t", link: "l" };
    s.store.inviteDialogOpen = true;
    s.store.reset();
    expect(s.store.list.items).toEqual([]);
    expect(s.store.createdInvite).toBeNull();
    expect(s.store.inviteDialogOpen).toBe(false);
  });
});
