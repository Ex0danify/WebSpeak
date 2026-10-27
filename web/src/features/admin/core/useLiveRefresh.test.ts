import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";

function mountWith(refresh: () => Promise<unknown> | void, intervalMs = 5000) {
  return mount(
    defineComponent({
      setup() {
        useLiveRefresh(refresh, intervalMs);
        return () => h("div");
      },
    }),
  );
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useLiveRefresh", () => {
  it("refreshes on every interval and stops when the component goes", async () => {
    const refresh = vi.fn(async () => {});
    const wrapper = mountWith(refresh);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("skips ticks while the tab is hidden and refreshes the moment it is shown", async () => {
    const refresh = vi.fn(async () => {});
    mountWith(refresh);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(refresh).not.toHaveBeenCalled();
    setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never overlaps a slow refresh, and carries on after one that failed", async () => {
    let release: () => void = () => {};
    const refresh = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockRejectedValueOnce(new Error("gateway gone"))
      .mockResolvedValue(undefined);
    mountWith(refresh);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
