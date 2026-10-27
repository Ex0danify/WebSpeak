import { mount } from "@vue/test-utils";
import { h } from "vue";
import { describe, expect, it } from "vitest";
import ListSelect, { type ListSelectItem } from "@/shared/ui/select/ListSelect.vue";
import { Field } from "@/shared/ui/field";

const items: ListSelectItem[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("ListSelect", () => {
  it("shows the selected item's label in the trigger", () => {
    const wrapper = mount(ListSelect, { props: { items, modelValue: "b" } });
    expect(wrapper.get("button").text()).toContain("Beta");
  });

  it("shows the placeholder when nothing is selected", () => {
    const wrapper = mount(ListSelect, { props: { items, modelValue: undefined, placeholder: "Pick one" } });
    expect(wrapper.get("button").text()).toContain("Pick one");
  });

  it("lets a value slot override the trigger display", () => {
    const wrapper = mount(ListSelect, {
      props: { items, modelValue: "a" },
      slots: { value: ({ item }: { item?: ListSelectItem }) => h("span", `★ ${item?.label}`) },
    });
    expect(wrapper.get("button").text()).toContain("★ Alpha");
  });

  it("adopts the surrounding Field's id on its trigger", () => {
    const wrapper = mount(Field, {
      props: { id: "device", label: "Device" },
      slots: { default: () => h(ListSelect, { items, modelValue: "a" }) },
    });
    expect(wrapper.get("#device").element.tagName).toBe("BUTTON");
  });

  it("carries an item with an empty value and reports it as an empty string", async () => {
    const withEmpty: ListSelectItem[] = [{ value: "", label: "Default" }, ...items];
    const wrapper = mount(ListSelect, { props: { items: withEmpty, modelValue: "", "onUpdate:modelValue": () => {} } });
    expect(wrapper.get("button").text()).toContain("Default");
    await wrapper.setProps({ modelValue: "b" });
    expect(wrapper.get("button").text()).toContain("Beta");
  });
});
