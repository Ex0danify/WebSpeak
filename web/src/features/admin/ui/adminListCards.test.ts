import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import type { AdminConnectionRecord, AdminEvent, AdminSession, ManagedInvite } from "@/features/admin/core/adminTypes";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";
import AdminDiagnosticsPage from "@/features/admin/diagnostics/AdminDiagnosticsPage.vue";
import { useAdminEventLogStore } from "@/features/admin/events/adminEventLog";
import EventLogCard from "@/features/admin/events/EventLogCard.vue";
import { useAdminUsersStore } from "@/features/admin/users/adminUsers";
import { useAdminConnectionsStore } from "@/features/admin/users/connections/adminConnections";
import ConnectionsCard from "@/features/admin/users/connections/ConnectionsCard.vue";
import { useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";
import InvitesCard from "@/features/admin/users/invites/InvitesCard.vue";
import SessionsCard from "@/features/admin/users/sessions/SessionsCard.vue";
import { useI18n } from "@/shared/i18n/useI18n";

const { t } = useI18n();

async function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  registerAdminStores();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:rest(.*)*", component: { template: "<div />" } }] });
  await router.push("/admin");
  return { pinia, plugins: [pinia, router] };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

const invite = (id: string): ManagedInvite => ({
  id,
  target: "ts.example.org:9987",
  channel: "Lobby",
  expiresAt: "2026-11-30T10:00:00.000Z",
  maxUses: 5,
  useCount: 2,
  createdAt: "2026-10-29T10:00:00.000Z",
  revokedAt: null,
  status: "active",
});

const session = (id: string, nickname: string): AdminSession => ({
  id,
  nickname,
  target: "ts.example.org:9987",
  clientIp: "203.0.113.9",
  relayName: null,
  relayTarget: null,
  state: "connected",
  createdAt: "2026-10-29T10:00:00.000Z",
  ageSeconds: 120,
  tsClientId: 7,
  channelId: "1",
  memberCount: 3,
});

const event = (id: number): AdminEvent => ({
  id,
  event: "GATEWAY_STARTED",
  category: "system",
  severity: "info",
  details: { version: "1.2.3" },
  createdAt: "2026-10-29T10:00:00.000Z",
});

const connection = (id: string, nickname: string): AdminConnectionRecord => ({
  id,
  nickname,
  clientIp: "203.0.113.5",
  target: "ts.example.com:9987",
  relayName: null,
  relayTarget: null,
  startedAt: "2026-10-29T10:00:00.000Z",
  connectedAt: "2026-10-29T10:00:02.000Z",
  disconnectedAt: null,
  durationSeconds: 90,
  status: "active",
  reason: null,
  failureDetail: null,
  audio: null,
  userAgent: null,
  client: null,
});

describe("InvitesCard", () => {
  it("says there is no invite, offers to make one and loads the newest on mount", async () => {
    const { pinia, plugins } = await setup();
    const store = useAdminInvitesStore();
    const showPreview = vi.fn();
    const openCreateInvite = vi.fn();
    Object.assign(store, { showPreview, openCreateInvite, loadInvites: vi.fn(async () => {}) });
    const wrapper = mount(InvitesCard, { attachTo: document.body, global: { plugins: [pinia, plugins[1]!] } });
    expect(showPreview).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain(t("inviteListEmpty"));
    await wrapper
      .findAll("button")
      .find((entry) => entry.text().includes(t("createInvite")))!
      .trigger("click");
    expect(openCreateInvite).toHaveBeenCalledOnce();
  });

  it("lists the invites and links to the full view when more exist", async () => {
    const { pinia, plugins } = await setup();
    const store = useAdminInvitesStore();
    Object.assign(store, { showPreview: vi.fn(), loadInvites: vi.fn(async () => {}) });
    Object.assign(store.list, { items: [invite("a"), invite("b")], total: 9 });
    const wrapper = mount(InvitesCard, { attachTo: document.body, global: { plugins: [pinia, plugins[1]!] } });
    expect(wrapper.findAll("li").length).toBeGreaterThanOrEqual(2);
    expect(wrapper.find('a[href="/admin/users/invites"]').exists()).toBe(true);
  });
});

describe("SessionsCard", () => {
  it("counts the sessions and shows the empty text without any", async () => {
    const { pinia, plugins } = await setup();
    const store = useAdminUsersStore();
    const loadSessions = vi.fn(async () => {});
    Object.assign(store, { loadSessions });
    const wrapper = mount(SessionsCard, { global: { plugins: [pinia, plugins[1]!] } });
    expect(loadSessions).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain(t("sessionEmpty"));
    expect(wrapper.find("strong").text()).toBe("0");
  });

  it("lists who is connected", async () => {
    const { pinia, plugins } = await setup();
    const store = useAdminUsersStore();
    Object.assign(store, { loadSessions: vi.fn(async () => {}) });
    store.users.sessions = [session("a", "alice"), session("b", "bob")];
    const wrapper = mount(SessionsCard, { global: { plugins: [pinia, plugins[1]!] } });
    expect(wrapper.text()).toContain("alice");
    expect(wrapper.text()).toContain("bob");
    expect(wrapper.find("strong").text()).toBe("2");
    expect(wrapper.text()).not.toContain(t("sessionEmpty"));
  });
});

describe("EventLogCard", () => {
  it("asks for as many events as the page has room for", async () => {
    const { pinia, plugins } = await setup();
    const store = useAdminEventLogStore();
    const showPreview = vi.fn();
    Object.assign(store, { showPreview, refreshLive: vi.fn(async () => {}) });
    const wrapper = mount(EventLogCard, { props: { limit: 8 }, global: { plugins: [pinia, plugins[1]!] } });
    expect(showPreview).toHaveBeenCalledWith(8);
    expect(wrapper.text()).toContain(t("eventLogEmpty"));
  });

  it("lists the events and links to the log", async () => {
    const { pinia, plugins } = await setup();
    const store = useAdminEventLogStore();
    Object.assign(store, { showPreview: vi.fn(), refreshLive: vi.fn(async () => {}) });
    Object.assign(store.list, { items: [event(1), event(2)], total: 40 });
    const wrapper = mount(EventLogCard, { props: { limit: 8 }, global: { plugins: [pinia, plugins[1]!] } });
    expect(wrapper.findAll("li").length).toBeGreaterThanOrEqual(2);
    expect(wrapper.find('a[href="/admin/diagnostics/events"]').exists()).toBe(true);
  });
});

describe("ConnectionsCard", () => {
  it("shows the empty text, then the connections", async () => {
    const { pinia, plugins } = await setup();
    const store = useAdminConnectionsStore();
    const showPreview = vi.fn();
    Object.assign(store, { showPreview, refreshLive: vi.fn(async () => {}) });
    const empty = mount(ConnectionsCard, { global: { plugins: [pinia, plugins[1]!] } });
    expect(showPreview).toHaveBeenCalledOnce();
    expect(empty.text()).toContain(t("connectionEmpty"));
    Object.assign(store.list, { items: [connection("a", "alice")], total: 30 });
    const filled = mount(ConnectionsCard, { global: { plugins: [pinia, plugins[1]!] } });
    expect(filled.text()).toContain("alice");
    expect(filled.find('a[href="/admin/users/connections"]').exists()).toBe(true);
  });
});

describe("AdminDiagnosticsPage", () => {
  const stubs = {
    EventLogCard: { template: "<section data-test='events' />" },
    RetentionCard: { template: "<section data-test='retention' />" },
  };

  it("loads the facts when it is entered and shows the version in the notice", async () => {
    const { pinia, plugins } = await setup();
    const store = useAdminDiagnosticsStore();
    const loadDiagnostics = vi.fn(async () => {});
    Object.assign(store, { loadDiagnostics });
    const wrapper = mount(AdminDiagnosticsPage, { global: { plugins: [pinia, plugins[1]!], stubs } });
    expect(loadDiagnostics).toHaveBeenCalled();
    expect(wrapper.text()).toContain(t("updateNotice", { version: "—" }));
    store.diagnostics.facts.version = "1.2.3";
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain(t("updateNotice", { version: "1.2.3" }));
    expect(wrapper.find("[data-test='events']").exists()).toBe(true);
    expect(wrapper.find("[data-test='retention']").exists()).toBe(true);
  });

  it("reloads on the refresh button", async () => {
    const { pinia, plugins } = await setup();
    const loadDiagnostics = vi.fn(async () => {});
    Object.assign(useAdminDiagnosticsStore(), { loadDiagnostics });
    const wrapper = mount(AdminDiagnosticsPage, { global: { plugins: [pinia, plugins[1]!], stubs } });
    loadDiagnostics.mockClear();
    await wrapper
      .findAll("button")
      .find((entry) => entry.attributes("aria-label")?.length || entry.text())!
      .trigger("click");
    expect(loadDiagnostics).toHaveBeenCalled();
  });
});
