import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useDebouncedSearch } from "@/features/admin/core/useDebouncedSearch";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(initial = "") {
  const current = ref(initial);
  const apply = vi.fn();
  let text!: ReturnType<typeof useDebouncedSearch>;
  const wrapper = mount(
    defineComponent({
      setup() {
        text = useDebouncedSearch(() => current.value, apply);
        return () => null;
      },
    }),
  );
  return { current, apply, wrapper, text: () => text };
}

describe("useDebouncedSearch", () => {
  it("starts with the current search and applies the last text once typing pauses", async () => {
    const { apply, text } = setup("abc");
    expect(text().value).toBe("abc");
    text().value = "abcd";
    await nextTick();
    text().value = "abcde";
    await nextTick();
    await vi.advanceTimersByTimeAsync(299);
    expect(apply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith("abcde");
  });

  it("does not apply what the search already is", async () => {
    const { apply, text } = setup("abc");
    text().value = "abc ";
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(apply).not.toHaveBeenCalled();
  });

  it("takes over a search that changes from outside", async () => {
    const { current, apply, text } = setup("abc");
    current.value = "";
    await nextTick();
    expect(text().value).toBe("");
    expect(apply).not.toHaveBeenCalled();
  });

  it("drops a search that is still waiting when it unmounts", async () => {
    const { apply, text, wrapper } = setup();
    text().value = "late";
    await nextTick();
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(500);
    expect(apply).not.toHaveBeenCalled();
  });
});
