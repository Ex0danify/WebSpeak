import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, RouterLinkStub, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import type { AdminServer, ManagedInvite } from "@/features/admin/core/adminTypes";
import { useAdminServersStore } from "@/features/admin/gateway/adminServers";
import { useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";
import InvitesView from "@/features/admin/users/invites/InvitesView.vue";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ path: "/admin" }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const { t } = useI18n();

const invite = (id: string, overrides: Partial<ManagedInvite> = {}): ManagedInvite => ({
  id,
  target: "ts.example.org:9987",
  channel: "Lobby",
  expiresAt: "2026-11-30T10:00:00.000Z",
  maxUses: 5,
  useCount: 2,
  createdAt: "2026-10-29T10:00:00.000Z",
  revokedAt: null,
  status: "active",
  ...overrides,
});

const server = (id: string, name: string): AdminServer => ({
  id,
  name,
  target: `${id}.example.org:9987`,
  hasPassword: false,
  lastTestAt: null,
  lastTestLatencyMs: null,
  lastTestError: null,
});

let wrapper: VueWrapper | undefined;

function setup(servers: AdminServer[] = [server("a", "Main"), server("b", "Backup")]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  registerAdminStores();
  Object.assign(useAdminServersStore(), { servers });
  const store = useAdminInvitesStore();
  const actions = {
    showPages: vi.fn(),
    loadInvites: vi.fn(async () => {}),
    goToPage: vi.fn(),
    filterByStatus: vi.fn(),
    openCreateInvite: vi.fn(),
    revokeInvite: vi.fn(),
    createInvite: vi.fn(),
    copyInviteLink: vi.fn(),
  };
  // The view takes the actions when it is set up, so they are replaced before it mounts.
  Object.assign(store, actions);
  const mountView = () =>
    (wrapper = mount(InvitesView, { attachTo: document.body, global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } }));
  return { store, actions, mountView };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
});

describe("InvitesView", () => {
  it("lists the invites and says when there is none", async () => {
    const { store, actions, mountView } = setup();
    const view = mountView();
    expect(actions.showPages).toHaveBeenCalledOnce();
    expect(view.text()).toContain(t("inviteListEmpty"));
    Object.assign(store.list, { items: [invite("1"), invite("2", { channel: "", maxUses: 0, status: "expired" })], total: 2 });
    await nextTick();
    const rows = view.findAll(".invite-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("Lobby");
    expect(rows[0]!.text()).toContain(t("inviteUsed", { used: 2, max: 5 }));
    expect(rows[1]!.text()).toContain(t("defaultChannel"));
    expect(rows[1]!.text()).toContain(t("inviteUsedUnlimited", { used: 2 }));
  });

  it("offers to revoke only an invite that is still active", async () => {
    const { store, actions, mountView } = setup();
    Object.assign(store.list, { items: [invite("1"), invite("2", { status: "revoked" })], total: 2 });
    const view = mountView();
    const revoke = view.findAll("button").filter((button) => button.text() === t("revoke"));
    expect(revoke).toHaveLength(1);
    await revoke[0]!.trigger("click");
    expect(actions.revokeInvite).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
  });

  it("opens the dialog from the create button and refreshes on its own", async () => {
    const { actions, mountView } = setup();
    const view = mountView();
    const create = view.findAll("button").find((button) => button.text() === t("createInvite"));
    await create!.trigger("click");
    expect(actions.openCreateInvite).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(actions.loadInvites).toHaveBeenCalledWith(true);
  });

  it("filters by the status that is chosen", async () => {
    const { actions, mountView } = setup();
    const view = mountView();
    const radios = view.findAll("[role=radio]");
    expect(radios.map((radio) => radio.text())).toContain(t("filterAll"));
    await radios.find((radio) => radio.text() === t("active"))!.trigger("click");
    expect(actions.filterByStatus).toHaveBeenCalledWith("active");
  });
});

describe("InviteDialog", () => {
  const dialog = () => document.body.querySelector<HTMLElement>("[role=dialog]");

  it("makes an invite for the first server and names each field", async () => {
    const { store, mountView } = setup();
    mountView();
    store.inviteDialogOpen = true;
    await vi.advanceTimersByTimeAsync(50);
    expect(store.inviteForm.serverId).toBe("a");
    const root = dialog()!;
    expect(root.textContent).toContain(t("createInvite"));
    const inputs = [...root.querySelectorAll<HTMLInputElement>("input")];
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    for (const input of inputs) expect(root.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
  });

  it("moves a selection off a server that was removed", async () => {
    const { store, mountView } = setup();
    mountView();
    store.inviteForm.serverId = "b";
    Object.assign(useAdminServersStore(), { servers: [server("a", "Main")] });
    await nextTick();
    expect(store.inviteForm.serverId).toBe("a");
    Object.assign(useAdminServersStore(), { servers: [] });
    await nextTick();
    expect(store.inviteForm.serverId).toBe("");
  });

  it("creates the invite on submit and shows what went wrong", async () => {
    const { store, actions, mountView } = setup();
    mountView();
    store.inviteDialogOpen = true;
    store.inviteError = "Server unreachable";
    await vi.advanceTimersByTimeAsync(50);
    expect(dialog()!.textContent).toContain("Server unreachable");
    document.body.querySelector<HTMLFormElement>("#invite-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(actions.createInvite).toHaveBeenCalledOnce();
  });

  it("shows the link of a created invite and copies it", async () => {
    const { store, actions, mountView } = setup();
    mountView();
    store.inviteDialogOpen = true;
    store.createdInvite = { token: "tok", link: "https://ts.example.org/join/tok" };
    await vi.advanceTimersByTimeAsync(50);
    const root = dialog()!;
    expect(root.textContent).toContain(t("inviteCreated"));
    expect(root.querySelector<HTMLInputElement>("input[readonly]")!.value).toBe("https://ts.example.org/join/tok");
    const copy = [...root.querySelectorAll("button")].find((button) => button.textContent?.includes(t("copyLink")));
    copy!.click();
    expect(actions.copyInviteLink).toHaveBeenCalledOnce();
  });
});
