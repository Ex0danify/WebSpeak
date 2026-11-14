import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChatEditorFallback from "@/features/room/chat/editor/ChatEditorFallback.vue";

describe("ChatEditorFallback", () => {
  it("holds the place of the box while it loads, with its height and a busy state", () => {
    const wrapper = mount(ChatEditorFallback);
    expect(wrapper.attributes("aria-busy")).toBe("true");
    expect(wrapper.classes()).toEqual(expect.arrayContaining(["min-h-9", "max-compact:min-h-11", "flex-1"]));
    expect(wrapper.attributes("role")).toBeUndefined();
    expect(wrapper.text()).toBe("");
  });

  it("says so, as an alert, when the box could not be loaded", () => {
    const wrapper = mount(ChatEditorFallback, { props: { failed: true } });
    expect(wrapper.attributes("role")).toBe("alert");
    expect(wrapper.attributes("aria-busy")).toBeUndefined();
    expect(wrapper.text()).toBe("The message box could not be loaded. Reload the page to try again.");
  });
});
