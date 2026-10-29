import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import RefreshButton from "@/features/admin/ui/RefreshButton.vue";

const icon = (wrapper: ReturnType<typeof mount>) => wrapper.find("svg");
const spinning = (wrapper: ReturnType<typeof mount>) => icon(wrapper).classes().includes("animate-spin");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RefreshButton", () => {
  it("is still while nothing loads and tells the parent about a click", async () => {
    const onClick = vi.fn();
    const wrapper = mount(RefreshButton, { props: { loading: false, onClick } });
    expect(spinning(wrapper)).toBe(false);
    expect(wrapper.attributes("aria-busy")).toBeUndefined();
    await wrapper.trigger("click");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("turns for a whole turn even when the answer is faster", async () => {
    const wrapper = mount(RefreshButton, { props: { loading: false } });
    await wrapper.setProps({ loading: true });
    expect(spinning(wrapper)).toBe(true);
    expect(wrapper.attributes("aria-busy")).toBe("true");
    await vi.advanceTimersByTimeAsync(150);
    await wrapper.setProps({ loading: false });
    await vi.advanceTimersByTimeAsync(800);
    expect(spinning(wrapper)).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(spinning(wrapper)).toBe(false);
  });

  it("finishes the turn it is in when a slow answer arrives", async () => {
    const wrapper = mount(RefreshButton, { props: { loading: true } });
    await vi.advanceTimersByTimeAsync(2300);
    await wrapper.setProps({ loading: false });
    await vi.advanceTimersByTimeAsync(600);
    expect(spinning(wrapper)).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    expect(spinning(wrapper)).toBe(false);
  });

  it("keeps turning when a new load starts before the turn is done", async () => {
    const wrapper = mount(RefreshButton, { props: { loading: true } });
    await vi.advanceTimersByTimeAsync(300);
    await wrapper.setProps({ loading: false });
    await vi.advanceTimersByTimeAsync(300);
    await wrapper.setProps({ loading: true });
    await vi.advanceTimersByTimeAsync(1500);
    expect(spinning(wrapper)).toBe(true);
    await wrapper.setProps({ loading: false });
    await vi.advanceTimersByTimeAsync(800);
    expect(spinning(wrapper)).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    expect(spinning(wrapper)).toBe(false);
  });
});
