import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { ListFooter, Pager } from "@/shared/ui/list";

const labels = {
  label: "Pages",
  previousLabel: "Previous",
  nextLabel: "Next",
  firstLabel: "First",
  lastLabel: "Last",
  summary: "Page 2 of 3",
  pageCount: 3,
  pageLabel: (page: number) => `Page ${page}`,
};

const numbers = (wrapper: ReturnType<typeof mount>) => wrapper.findAll("button[aria-label^='Page']").map((button) => button.text());

describe("Pager", () => {
  it("steps through the pages and stops at both ends", async () => {
    const wrapper = mount(Pager, { props: { ...labels, modelValue: 1 } });
    const previous = wrapper.get("[aria-label='Previous']");
    const next = wrapper.get("[aria-label='Next']");
    expect(previous.attributes("disabled")).toBeDefined();
    await next.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[2]]);
    await wrapper.setProps({ modelValue: 3 });
    expect(wrapper.get("[aria-label='Next']").attributes("disabled")).toBeDefined();
    await wrapper.get("[aria-label='Previous']").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([2]);
  });

  it("jumps to a page by its number and marks the current one", async () => {
    const wrapper = mount(Pager, { props: { ...labels, modelValue: 2 } });
    expect(numbers(wrapper)).toEqual(["1", "2", "3"]);
    expect(wrapper.get("[aria-current='page']").text()).toBe("2");
    await wrapper.get("[aria-label='Page 3']").trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[3]]);
  });

  it("shortens a long list to the ends and the pages around the current one", async () => {
    const wrapper = mount(Pager, { props: { ...labels, pageCount: 20, modelValue: 1 } });
    expect(numbers(wrapper)).toEqual(["1", "2", "20"]);
    await wrapper.setProps({ modelValue: 10 });
    expect(numbers(wrapper)).toEqual(["1", "9", "10", "11", "20"]);
    expect(wrapper.findAll("[aria-hidden='true']").filter((gap) => gap.text() === "…")).toHaveLength(2);
    await wrapper.setProps({ modelValue: 3 });
    expect(numbers(wrapper)).toEqual(["1", "2", "3", "4", "20"]);
    await wrapper.setProps({ modelValue: 20 });
    expect(numbers(wrapper)).toEqual(["1", "19", "20"]);
  });

  it("goes to the first and the last page from anywhere, and the ends are disabled there", async () => {
    const wrapper = mount(Pager, { props: { ...labels, pageCount: 20, modelValue: 10 } });
    await wrapper.get("[aria-label='Last']").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([20]);
    await wrapper.get("[aria-label='First']").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([1]);
    await wrapper.setProps({ modelValue: 1 });
    expect(wrapper.get("[aria-label='First']").attributes("disabled")).toBeDefined();
    await wrapper.setProps({ modelValue: 20 });
    expect(wrapper.get("[aria-label='Last']").attributes("disabled")).toBeDefined();
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
