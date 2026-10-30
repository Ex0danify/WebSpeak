import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, RouterLinkStub, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import type { AdminSession } from "@/features/admin/core/adminTypes";
import AdminListView from "@/features/admin/ui/AdminListView.vue";
import { useAdminConnectionsStore } from "@/features/admin/users/connections/adminConnections";
import ConnectionsView from "@/features/admin/users/connections/ConnectionsView.vue";
import { useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";
import { useAdminUsersStore } from "@/features/admin/users/adminUsers";
import AdminUsersPage from "@/features/admin/users/AdminUsersPage.vue";
import SessionsView from "@/features/admin/users/sessions/SessionsView.vue";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ path: "/admin" }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const { t } = useI18n();

const session = (id: number): AdminSession => ({
  id: `s${id}`,
  nickname: `Guest ${id}`,
  target: "ts.example.org:9987",
  clientIp: "203.0.113.9",
  relayName: null,
  relayTarget: null,
  state: "connected",
  createdAt: "2026-10-29T10:00:00.000Z",
  ageSeconds: 90,
  tsClientId: id,
  channelId: null,
  memberCount: 3,
});

let wrapper: VueWrapper | undefined;

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  registerAdminStores();
  const global = { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } };
  return { pinia, global };
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

describe("SessionsView", () => {
  function mountView() {
    const { global } = setup();
    const store = useAdminUsersStore();
    const actions = { loadSessions: vi.fn(async () => {}), terminateSession: vi.fn() };
    // The view takes the actions when it is set up, so they are replaced before it mounts.
    Object.assign(store, actions);
    store.users.sessions = Array.from({ length: 30 }, (_, index) => session(index + 1));
    wrapper = mount(SessionsView, { attachTo: document.body, global });
    return { store, actions, view: wrapper };
  }

  it("loads the sessions, keeps refreshing, and shows the first page of them", async () => {
    const { actions, view } = mountView();
    expect(actions.loadSessions).toHaveBeenCalledOnce();
    expect(view.findAll("tbody tr")).toHaveLength(25);
    await vi.advanceTimersByTimeAsync(5000);
    expect(actions.loadSessions).toHaveBeenCalledWith(true);
  });

  it("ends a session from its row and shows the one that is ending", async () => {
    const { store, actions, view } = mountView();
    const row = view.findAll("tbody tr")[0]!;
    await row.find("button").trigger("click");
    expect(actions.terminateSession).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
    expect(row.find("button").text()).toBe(t("endSession"));
    store.terminatingSession = "s1";
    await nextTick();
    expect(row.find("button").text()).toBe(t("terminating"));
    expect(row.find("button").attributes("disabled")).toBeDefined();
  });

  it("steps back to the last page when sessions end under it", async () => {
    const { store, view } = mountView();
    view.findComponent(AdminListView).vm.$emit("update:page", 2);
    await nextTick();
    expect(view.findAll("tbody tr")).toHaveLength(5);
    store.users.sessions = store.users.sessions.slice(0, 3);
    await nextTick();
    expect(view.findAll("tbody tr")).toHaveLength(3);
  });

  it("says when nobody is connected", async () => {
    const { store, view } = mountView();
    store.users.sessions = [];
    await nextTick();
    expect(view.text()).toContain(t("sessionEmpty"));
  });
});

describe("ConnectionsView", () => {
  function mountView() {
    const { global } = setup();
    const store = useAdminConnectionsStore();
    const actions = {
      showPages: vi.fn(),
      loadConnections: vi.fn(async () => {}),
      refreshLive: vi.fn(),
      goToPage: vi.fn(),
      filter: vi.fn(),
      clearFilters: vi.fn(),
    };
    // The view takes most actions when it is set up, so they are replaced before it mounts.
    Object.assign(store, actions);
    wrapper = mount(ConnectionsView, { attachTo: document.body, global });
    return { store, actions, view: wrapper };
  }

  it("starts from the first page and refreshes on its own", async () => {
    const { actions, view } = mountView();
    expect(actions.showPages).toHaveBeenCalledOnce();
    expect(view.text()).toContain(t("connectionEmpty"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(actions.refreshLive).toHaveBeenCalled();
  });

  it("says nothing matches once a filter is set, and clears the filters", async () => {
    const { store, actions, view } = mountView();
    expect(view.text()).not.toContain(t("eventFiltersClear"));
    store.list.status = "failed";
    await nextTick();
    expect(view.text()).toContain(t("connectionNoMatch"));
    const clear = view.findAll("button").find((button) => button.text() === t("eventFiltersClear"));
    await clear!.trigger("click");
    expect(actions.clearFilters).toHaveBeenCalledOnce();
  });

  it("searches once the typing pauses", async () => {
    const { actions, view } = mountView();
    await view.find("input[type=search]").setValue("mallory");
    expect(actions.filter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(actions.filter).toHaveBeenCalledWith({ search: "mallory" });
  });
});

describe("AdminUsersPage", () => {
  function mountPage() {
    const { global } = setup();
    const users = useAdminUsersStore();
    const invites = useAdminInvitesStore();
    const connections = useAdminConnectionsStore();
    const loaders = {
      users: vi.fn(async () => {}),
      invites: vi.fn(async () => {}),
      connections: vi.fn(async () => {}),
    };
    Object.assign(users, { loadSessions: loaders.users });
    Object.assign(invites, { loadInvites: loaders.invites });
    Object.assign(connections, { loadConnections: loaders.connections });
    wrapper = mount(AdminUsersPage, {
      global: { ...global, stubs: { ...global.stubs, SessionsCard: true, ConnectionsCard: true, InvitesCard: true } },
    });
    return { users, invites, connections, loaders, page: wrapper };
  }

  it("shows the three cards, the sessions and the history beside the invites", () => {
    const { page } = mountPage();
    expect(page.text()).toContain(t("users"));
    expect(page.html()).toContain("sessions-card-stub");
    expect(page.html()).toContain("connections-card-stub");
    expect(page.html()).toContain("invites-card-stub");
  });

  it("asks for all of them again on refresh, and is busy while any is loading", async () => {
    const { users, invites, connections, loaders, page } = mountPage();
    await page.find("button").trigger("click");
    expect(loaders.users).toHaveBeenCalledOnce();
    expect(loaders.invites).toHaveBeenCalledOnce();
    expect(loaders.connections).toHaveBeenCalledOnce();

    for (const set of [
      () => (users.sessionsLoading = true),
      () => (invites.list.loading = true),
      () => (connections.list.loading = true),
    ]) {
      users.sessionsLoading = false;
      invites.list.loading = false;
      connections.list.loading = false;
      set();
      await nextTick();
      expect(page.find("button[aria-busy=true]").exists()).toBe(true);
    }
  });
});
