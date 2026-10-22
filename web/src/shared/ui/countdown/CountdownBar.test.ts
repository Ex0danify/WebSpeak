import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CountdownBar from "@/shared/ui/countdown/CountdownBar.vue";

describe("CountdownBar", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down and emits done when the time runs out", () => {
    const wrapper = mount(CountdownBar, { props: { durationMs: 1000 } });
    expect(wrapper.text()).toContain("1s");
    vi.advanceTimersByTime(1000);
    expect(wrapper.emitted("done")).toHaveLength(1);
  });

  it("shows the largest sensible unit", () => {
    expect(mount(CountdownBar, { props: { durationMs: 90000 } }).text()).toContain("2m");
    expect(mount(CountdownBar, { props: { durationMs: 2 * 3600 * 1000 } }).text()).toContain("2h");
  });

  it("freezes while paused and resumes from where it stopped", async () => {
    const wrapper = mount(CountdownBar, { props: { durationMs: 1000, paused: true } });
    vi.advanceTimersByTime(3000);
    expect(wrapper.emitted("done")).toBeUndefined();

    await wrapper.setProps({ paused: false });
    vi.advanceTimersByTime(1000);
    expect(wrapper.emitted("done")).toHaveLength(1);
  });
});
