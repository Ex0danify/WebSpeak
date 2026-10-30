import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminGatewayStore } from "@/features/admin/core/adminGateway";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import StatusBanner from "@/features/admin/dashboard/StatusBanner.vue";
import DiagnosticsCard from "@/features/admin/diagnostics/DiagnosticsCard.vue";
import AdminShell from "@/features/admin/shell/AdminShell.vue";
import AdminSidebar from "@/features/admin/shell/AdminSidebar.vue";
import { adminNavRoutes } from "@/features/admin/shell/adminRoutes";
import { useI18n } from "@/shared/i18n/useI18n";

const { t } = useI18n();

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  registerAdminStores();
  return pinia;
}

async function routerAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:rest(.*)*", component: { template: "<div />" } }],
  });
  await router.push(path);
  return router;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("StatusBanner", () => {
  it("says everything runs while the gateway answers", () => {
    const pinia = setup();
    const wrapper = mount(StatusBanner, { global: { plugins: [pinia] } });
    expect(wrapper.find("h2").text()).toBe(t("everythingRunning"));
    expect(wrapper.text()).toContain(t("overviewLead"));
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("says the gateway is gone, counts down to the next try and lets the admin try at once", async () => {
    const pinia = setup();
    const gateway = useAdminGatewayStore();
    const retryNow = vi.fn();
    Object.assign(gateway, { status: "offline", retryIn: 7, retryNow });
    const wrapper = mount(StatusBanner, { global: { plugins: [pinia] } });
    expect(wrapper.find("h2").text()).toBe(t("gatewayOffline"));
    expect(wrapper.text()).toContain(t("gatewayOfflineLead"));
    expect(wrapper.text()).toContain(t("gatewayRetryIn", { seconds: 7 }));
    await wrapper.find("button").trigger("click");
    expect(retryNow).toHaveBeenCalledOnce();
    gateway.retryIn = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain(t("gatewayRetrying"));
  });
});

describe("AdminSidebar", () => {
  const mountSidebar = async (path: string) => mount(AdminSidebar, { global: { plugins: [setup(), await routerAt(path)] } });

  it("lists the pages of the console and marks the one that is open", async () => {
    const wrapper = await mountSidebar("/admin/gateway");
    const links = wrapper.findAll("nav a");
    expect(links.map((link) => link.attributes("href"))).toEqual(adminNavRoutes.map((entry) => entry.path));
    const current = links.filter((link) => link.attributes("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]!.attributes("href")).toBe("/admin/gateway");
    expect(current[0]!.attributes("aria-current")).toBe("page");
  });

  it("keeps the page of a sub-view marked, but not as the page itself", async () => {
    const wrapper = await mountSidebar("/admin/users/invites");
    const current = wrapper.findAll("nav a").find((link) => link.attributes("aria-current"))!;
    expect(current.attributes("href")).toBe("/admin/users");
    expect(current.attributes("aria-current")).toBe("true");
  });

  it("opens the guest page in a new tab and logs out", async () => {
    const pinia = setup();
    const logout = vi.fn();
    Object.assign(useAdminSessionStore(), { logout });
    const wrapper = mount(AdminSidebar, { global: { plugins: [pinia, await routerAt("/admin")] } });
    const guest = wrapper.find('a[href="/"]');
    expect(guest.attributes("target")).toBe("_blank");
    expect(guest.text()).toContain(t("openGuest"));
    const button = wrapper.findAll("button").find((entry) => entry.text().includes(t("logout")))!;
    await button.trigger("click");
    expect(logout).toHaveBeenCalledOnce();
  });
});

describe("DiagnosticsCard", () => {
  it("shows the facts of the gateway, a dash for what it did not tell", async () => {
    const pinia = setup();
    const store = useAdminDiagnosticsStore();
    const wrapper = mount(DiagnosticsCard, { global: { plugins: [pinia] } });
    const values = () => wrapper.findAll("dd").map((entry) => entry.text());
    expect(values().slice(0, 3)).toEqual(["—", "—", "— / —"]);
    expect(values()[3]).toContain("—");
    store.diagnostics.facts = { version: "1.2.3", node: "v22.1.0", platform: "linux", arch: "x64", schemaVersion: 9, createdSessions: 42 };
    await wrapper.vm.$nextTick();
    expect(values().slice(0, 3)).toEqual(["1.2.3", "v22.1.0", "linux / x64"]);
    expect(values()[3]).toContain("9");
    expect(values()[4]).toBe("42");
  });

  it("offers the bundle as a download and the backup as an action", async () => {
    const pinia = setup();
    const store = useAdminDiagnosticsStore();
    const downloadBackup = vi.fn();
    Object.assign(store, { downloadBackup });
    const wrapper = mount(DiagnosticsCard, { global: { plugins: [pinia] } });
    const bundle = wrapper.find('a[href="/api/admin/diagnostics/bundle"]');
    expect(bundle.attributes("aria-describedby")).toBe("bundle-hint");
    expect(wrapper.find("#bundle-hint").text()).toBe(t("bundleHint"));
    await wrapper.findAll("button").find((entry) => entry.text() === t("exportBackup"))!.trigger("click");
    expect(downloadBackup).toHaveBeenCalledOnce();
    expect(wrapper.find("#backup-hint").text()).toBe(t("backupHint"));
  });
});

describe("AdminShell", () => {
  const stubs = {
    AdminSidebar: { template: "<aside data-test='sidebar' />" },
    AdminTopbar: { template: "<header data-test='topbar' />" },
    AdminLoginScreen: { template: "<div data-test='login' />" },
    AdminChangePasswordScreen: { template: "<div data-test='change' />" },
    AdminDashboardPage: { template: "<div data-test='page' />" },
  };

  async function mountShell(screen: string, loading = false) {
    const pinia = setup();
    const gateway = useAdminGatewayStore();
    const start = vi.fn();
    const stop = vi.fn();
    Object.assign(gateway, { start, stop });
    Object.assign(useAdminSessionStore(), { screen, loading });
    const wrapper = mount(AdminShell, { global: { plugins: [pinia, await routerAt("/admin")], stubs } });
    return { wrapper, gateway, start, stop, feedback: useAdminFeedbackStore() };
  }

  it("shows a spinner while the session is checked", async () => {
    const { wrapper, start } = await mountShell("login", true);
    expect(wrapper.text()).toContain(t("loading"));
    expect(wrapper.find("[data-test='login']").exists()).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });

  it("shows the sign-in screens and does not watch the gateway", async () => {
    expect((await mountShell("login")).wrapper.find("[data-test='login']").exists()).toBe(true);
    const { wrapper, start } = await mountShell("change-password");
    expect(wrapper.find("[data-test='change']").exists()).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });

  it("shows the console once signed in and watches the gateway until it is left", async () => {
    const { wrapper, start, stop } = await mountShell("admin");
    expect(start).toHaveBeenCalledOnce();
    expect(wrapper.find("[data-test='sidebar']").exists()).toBe(true);
    expect(wrapper.find("[data-test='topbar']").exists()).toBe(true);
    expect(wrapper.find("[data-test='page']").exists()).toBe(true);
    useAdminSessionStore().screen = "login";
    await wrapper.vm.$nextTick();
    expect(stop).toHaveBeenCalled();
    wrapper.unmount();
    expect(stop.mock.calls.length).toBeGreaterThan(1);
  });

  it("shows a failure above the page, unless the gateway being gone explains it", async () => {
    const { wrapper, gateway, feedback } = await mountShell("admin");
    expect(wrapper.find("[role='alert'], .bg-danger-soft").exists()).toBe(false);
    feedback.errorMessage = "Something broke";
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Something broke");
    gateway.status = "offline";
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain("Something broke");
  });
});
