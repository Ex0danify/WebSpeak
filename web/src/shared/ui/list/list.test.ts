import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { ListFooter, Pager } from "@/shared/ui/list";

const labels = { label: "Pages", previousLabel: "Previous", nextLabel: "Next", summary: "Page 2 of 3", pageCount: 3 };

describe("Pager", () => {
  it("steps through the pages and stops at both ends", async () => {
    const wrapper = mount(Pager, { props: { ...labels, modelValue: 1 } });
    const [previous, next] = wrapper.findAll("button");
    expect(previous!.attributes("disabled")).toBeDefined();
    await next!.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[2]]);
    await wrapper.setProps({ modelValue: 3 });
    expect(wrapper.findAll("button")[1]!.attributes("disabled")).toBeDefined();
    await wrapper.findAll("button")[0]!.trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([2]);
  });

  it("names itself and announces the position", () => {
    const wrapper = mount(Pager, { props: { ...labels, modelValue: 2 } });
    expect(wrapper.get("nav").attributes("aria-label")).toBe("Pages");
    expect(wrapper.get("[aria-live]").text()).toBe("Page 2 of 3");
  });
});

describe("ListFooter", () => {
  it("shows the summary and the way to the rest", () => {
    const wrapper = mount(ListFooter, { props: { summary: "Showing 8 of 11" }, slots: { default: "<a href='#all'>View all</a>" } });
    expect(wrapper.text()).toContain("Showing 8 of 11");
    expect(wrapper.get("a").text()).toBe("View all");
  });
});
