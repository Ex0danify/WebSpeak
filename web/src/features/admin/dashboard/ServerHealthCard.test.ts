import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import ServerHealthCard from "@/features/admin/dashboard/ServerHealthCard.vue";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ path: "/admin" }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const { t } = useI18n();

function mountCard(servers: Array<Record<string, unknown>>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  registerAdminStores();
  Object.assign(useAdminOverviewStore().overview, { servers });
  return mount(ServerHealthCard, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } });
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("ServerHealthCard", () => {
  it("says when there is no server and links to the page that manages them", () => {
    const wrapper = mountCard([]);
    expect(wrapper.text()).toContain(t("serverListEmpty"));
    expect(wrapper.findComponent(RouterLinkStub).props("to")).toBe("/admin/gateway");
  });

  it("tells each server's state with a dot and a text, and the latency when there is one", () => {
    const wrapper = mountCard([
      { id: "a", name: "Main", status: "reachable", lastTestAt: "2026-10-29T10:00:00.000Z", latencyMs: 42 },
      { id: "b", name: "Backup", status: "unreachable", lastTestAt: "2026-10-29T10:00:00.000Z", latencyMs: null },
      { id: "c", name: "Fresh", status: "untested", lastTestAt: null, latencyMs: null },
    ]);
    const rows = wrapper.findAll("li");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.find("i").classes()).toContain("bg-success");
    expect(rows[0]!.text()).toContain(t("reachable"));
    expect(rows[0]!.text()).toContain("42 ms");
    expect(rows[1]!.find("i").classes()).toContain("bg-danger");
    expect(rows[1]!.text()).toContain(t("unreachable"));
    expect(rows[1]!.text()).not.toContain(" ms");
    expect(rows[2]!.find("i").classes()).toContain("bg-line-strong");
    expect(rows[2]!.text()).toContain(t("notTested"));
    expect(wrapper.text()).not.toContain(t("serverListEmpty"));
  });
});
