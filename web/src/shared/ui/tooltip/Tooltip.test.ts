import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import Tooltip from "@/shared/ui/tooltip/Tooltip.vue";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function mountTooltip() {
  return mount(
    { components: { Tooltip }, template: '<Tooltip text="Change nickname"><button type="button" aria-label="Change">x</button></Tooltip>' },
    { attachTo: document.body },
  );
}

/** What the browser answers for the trigger: hovered, focus-visible, or neither. */
function answer(state: { hover?: boolean; focusVisible?: boolean }) {
  const real = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    if (selector === ":hover") return state.hover === true;
    if (selector === ":focus-visible") return state.focusVisible === true;
    return real.call(this, selector);
  });
}

const label = () => document.body.textContent?.includes("Change nickname") === true;

describe("Tooltip", () => {
  it("stays closed when code moves focus to the trigger without hover or keyboard focus", async () => {
    answer({});
    const wrapper = mountTooltip();
    wrapper.find("button").element.focus();
    await nextTick();
    await nextTick();
    expect(label()).toBe(false);
    wrapper.unmount();
  });

  it("opens for keyboard focus", async () => {
    answer({ focusVisible: true });
    const wrapper = mountTooltip();
    wrapper.find("button").element.focus();
    await nextTick();
    await nextTick();
    expect(label()).toBe(true);
    wrapper.unmount();
  });

  it("closes again when the trigger loses focus", async () => {
    answer({ focusVisible: true });
    const wrapper = mountTooltip();
    const button = wrapper.find("button").element;
    button.focus();
    await nextTick();
    await nextTick();
    expect(button.getAttribute("data-state")).not.toBe("closed");
    button.blur();
    await nextTick();
    await nextTick();
    expect(button.getAttribute("data-state")).toBe("closed");
    wrapper.unmount();
  });

  it("opens when the pointer rests on the trigger", async () => {
    vi.useFakeTimers();
    answer({ hover: true });
    const wrapper = mountTooltip();
    wrapper.find("button").element.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    expect(label()).toBe(true);
    vi.useRealTimers();
    wrapper.unmount();
  });
});
