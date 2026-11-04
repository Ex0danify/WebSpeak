import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { Slider } from "@/shared/ui/slider";

describe("Slider live level", () => {
  it("has no level strip unless live", () => {
    const wrapper = mount(Slider, { props: { modelValue: 10, "aria-label": "Gate" } });
    expect(wrapper.find(".inset-0").exists()).toBe(false);
  });

  it("writes the level onto the strip, clamped to 0..1", () => {
    const wrapper = mount(Slider, { props: { modelValue: 10, live: true, "aria-label": "Gate" } });
    const levelStrip = wrapper.find<HTMLElement>(".inset-0").element;
    const slider = wrapper.vm as unknown as { setLevel: (share: number) => void };

    slider.setLevel(0.4);
    expect(levelStrip.style.getPropertyValue("--level")).toBe("0.4");
    slider.setLevel(3);
    expect(levelStrip.style.getPropertyValue("--level")).toBe("1");
    slider.setLevel(Number.NaN);
    expect(levelStrip.style.getPropertyValue("--level")).toBe("0");
  });

  it("ignores a level when not live", () => {
    const wrapper = mount(Slider, { props: { modelValue: 10, "aria-label": "Gate" } });
    expect(() => (wrapper.vm as unknown as { setLevel: (share: number) => void }).setLevel(0.5)).not.toThrow();
  });
});
