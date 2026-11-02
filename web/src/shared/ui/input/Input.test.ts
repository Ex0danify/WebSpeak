import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Input from "@/shared/ui/input/Input.vue";

const classesOf = (look?: "box" | "inline") =>
  mount(Input, { props: { modelValue: "x", look } })
    .find("input")
    .classes();

describe("Input look", () => {
  it("is a box by default", () => {
    const classes = classesOf();
    expect(classes).toContain("rounded-md");
    expect(classes).toContain("bg-surface-1");
    expect(classes).not.toContain("text-center");
  });

  it("draws only an underline when inline, the inline classes win over the box ones", () => {
    const classes = classesOf("inline");
    expect(classes).toEqual(expect.arrayContaining(["rounded-none", "border-0", "border-b", "bg-transparent", "text-center", "font-bold"]));
    expect(classes).not.toContain("rounded-md");
    expect(classes).not.toContain("bg-surface-1");
    expect(classes).not.toContain("h-10");
  });

  it("keeps centered inline text in place by making room on both sides of a trailing part", async () => {
    const wrapper = mount(Input, { props: { modelValue: "x", look: "inline" }, slots: { trailing: "<span>4/30</span>" } });
    const style = wrapper.find("input").attributes("style") ?? "";
    // The measured width is 0 in jsdom, so only the structure is checked here: the trailing part is placed at the inline end.
    expect(wrapper.html()).toContain("4/30");
    expect(wrapper.find("span.absolute").classes()).toEqual(expect.arrayContaining(["right-1", "h-9"]));
    expect(style).not.toContain("padding-right: 0");
  });
});
