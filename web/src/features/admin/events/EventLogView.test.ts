import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, RouterLinkStub, type VueWrapper } from "@vue/test-utils";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import type { AdminEvent } from "@/features/admin/core/adminTypes";
import { useAdminEventLogStore } from "@/features/admin/events/adminEventLog";
import EventLogView from "@/features/admin/events/EventLogView.vue";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ path: "/admin" }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const { t } = useI18n();

const event = (id: number): AdminEvent => ({
  id,
  event: "SERVER_ADDED",
  category: "config",
  severity: "info",
  details: { name: `Server ${id}`, target: "ts.example.org:9987" },
  createdAt: "2026-10-29T10:00:00.000Z",
});

let wrapper: VueWrapper | undefined;

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  registerAdminStores();
  const store = useAdminEventLogStore();
  const actions = {
    showPages: vi.fn(),
    loadEvents: vi.fn(async () => {}),
    refreshLive: vi.fn(),
    filter: vi.fn(),
    clearFilters: vi.fn(),
    goToPage: vi.fn(),
    setPageSize: vi.fn(),
  };
  // The view takes most actions when it is set up, so they are replaced before it mounts.
  Object.assign(store, actions);
  return {
    store,
    actions,
    mountView: () =>
      (wrapper = mount(EventLogView, { attachTo: document.body, global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } })),
  };
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

describe("EventLogView", () => {
  it("shows the events it has and starts from the first page", () => {
    const { store, actions, mountView } = setup();
    Object.assign(store.list, { items: [event(1), event(2)], total: 2 });
    const view = mountView();
    expect(actions.showPages).toHaveBeenCalledOnce();
    expect(view.findAll(".event-row")).toHaveLength(2);
    expect(view.text()).toContain("Server 1");
    expect(view.text()).not.toContain(t("eventLogEmpty"));
  });

  it("says the log is empty, or that nothing matches once a filter is set, and clears the filters", async () => {
    const { store, actions, mountView } = setup();
    const view = mountView();
    expect(view.text()).toContain(t("eventLogEmpty"));
    expect(view.text()).not.toContain(t("eventFiltersClear"));
    store.list.range = "day";
    await view.vm.$nextTick();
    expect(view.text()).toContain(t("eventLogNoMatch"));
    const clear = view.findAll("button").find((button) => button.text() === t("eventFiltersClear"));
    await clear!.trigger("click");
    expect(actions.clearFilters).toHaveBeenCalledOnce();
  });

  it("searches once the typing pauses", async () => {
    const { actions, mountView } = setup();
    const view = mountView();
    await view.find("input[type=search]").setValue("login");
    expect(actions.filter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(actions.filter).toHaveBeenCalledWith({ search: "login" });
  });

  it("refreshes on its own while it is open", async () => {
    const { actions, mountView } = setup();
    mountView();
    await vi.advanceTimersByTimeAsync(5000);
    expect(actions.refreshLive).toHaveBeenCalled();
  });

  it("counts the shown severities and categories on its filter buttons", () => {
    const { store, mountView } = setup();
    const view = mountView();
    const buttons = view.findAll("button").map((button) => button.text());
    expect(buttons).toContain(t("eventSeveritiesButton", { shown: store.list.severities.length, total: 3 }));
    expect(buttons).toContain(t("eventCategoriesButton", { shown: store.list.categories.length, total: 6 }));
  });

  it("changes the severities from the filter popover", async () => {
    const { store, actions, mountView } = setup();
    const view = mountView();
    const label = t("eventSeveritiesButton", { shown: store.list.severities.length, total: 3 });
    const trigger = view.findAll("button").find((button) => button.text() === label);
    await trigger!.trigger("click");
    await vi.advanceTimersByTimeAsync(50);
    const boxes = document.body.querySelectorAll<HTMLElement>("[role=checkbox]");
    expect(boxes.length).toBe(3);
    boxes[0]!.click();
    await vi.advanceTimersByTimeAsync(50);
    expect(actions.filter).toHaveBeenCalledWith({ severities: expect.any(Array) });
  });
});
