import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createSaveStatus, SAVED_VISIBLE_MS } from "@/shared/lib/saveStatus";
import SavedHint from "@/shared/ui/savedHint/SavedHint.vue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mountHint() {
  const status = createSaveStatus();
  const wrapper = mount(SavedHint, { props: { status }, global: { stubs: { transition: false } } });
  return { status, wrapper };
}

describe("SavedHint", () => {
  it("says nothing until a save went through", () => {
    const { wrapper } = mountHint();
    expect(wrapper.text()).toBe("");
  });

  it("shows Saved for a moment, hidden from assistive tech, then goes away", async () => {
    const { status, wrapper } = mountHint();
    status.saved();
    await nextTick();
    expect(wrapper.text()).toContain("Saved");
    expect(wrapper.find("[aria-hidden=true]").exists()).toBe(true);
    vi.advanceTimersByTime(SAVED_VISIBLE_MS);
    await nextTick();
    expect(wrapper.text()).toBe("");
  });

  it("drops the line height when dense", async () => {
    const status = createSaveStatus();
    const wrapper = mount(SavedHint, { props: { status, dense: true }, global: { stubs: { transition: false } } });
    status.saved();
    await nextTick();
    expect(wrapper.find("span").classes()).toContain("leading-none");
    expect(wrapper.find("span").classes()).not.toContain("leading-5");
  });

  it("stays quiet while a save is running", async () => {
    const { status, wrapper } = mountHint();
    status.saving();
    await nextTick();
    expect(wrapper.text()).toBe("");
  });
});
