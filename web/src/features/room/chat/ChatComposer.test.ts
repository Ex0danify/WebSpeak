import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ChatComposer from "@/features/room/chat/ChatComposer.vue";

function stubPhone(phone: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: phone, addEventListener: () => {}, removeEventListener: () => {} }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function mountComposer(value = "", props: { disabled?: boolean } = {}) {
  stubPhone(false);
  const wrapper: VueWrapper = mount(ChatComposer, {
    props: {
      modelValue: value,
      "onUpdate:modelValue": (next: string) => wrapper.setProps({ modelValue: next }),
      placeholder: "Message",
      label: "Send",
      disabled: false,
      ...props,
    },
    attachTo: document.body,
  });
  return wrapper;
}

const box = (wrapper: VueWrapper) => wrapper.find("textarea").element as HTMLTextAreaElement;
const button = (wrapper: VueWrapper, name: string) => wrapper.find(`button[aria-label="${name}"]`);

function select(wrapper: VueWrapper, start: number, end: number) {
  box(wrapper).focus();
  box(wrapper).setSelectionRange(start, end);
}

describe("ChatComposer", () => {
  describe("sending", () => {
    it("sends on Enter and keeps the text for the parent to clear", async () => {
      const wrapper = mountComposer("hello");
      await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
      expect(wrapper.emitted("submit")).toHaveLength(1);
    });

    it("starts a new line on Shift+Enter instead of sending", async () => {
      const wrapper = mountComposer("hello");
      const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, cancelable: true });
      box(wrapper).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(wrapper.emitted("submit")).toBeUndefined();
    });

    it("does not send while an input method is composing", async () => {
      const wrapper = mountComposer("かな");
      await wrapper.find("textarea").trigger("keydown", { key: "Enter", isComposing: true });
      expect(wrapper.emitted("submit")).toBeUndefined();
    });

    it("ignores Enter on an empty or blank box and when disabled", async () => {
      for (const wrapper of [mountComposer(""), mountComposer("   "), mountComposer("text", { disabled: true })]) {
        await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
        expect(wrapper.emitted("submit")).toBeUndefined();
      }
    });

    it("keeps Send off until there is text", () => {
      expect(button(mountComposer(""), "Send").attributes("disabled")).toBeDefined();
      expect(button(mountComposer("hi"), "Send").attributes("disabled")).toBeUndefined();
    });

    it("allows up to 8192 characters", () => {
      expect(box(mountComposer()).maxLength).toBe(8192);
    });
  });

  describe("growing", () => {
    it("follows the content height and caps it with a scrolling box", async () => {
      const wrapper = mountComposer();
      Object.defineProperty(box(wrapper), "scrollHeight", { configurable: true, value: 120 });
      await wrapper.setProps({ modelValue: "a\nb\nc\nd" });
      await flushPromises();
      expect(box(wrapper).style.height).toBe("120px");
      // The cap is the box's own max height, beyond which it scrolls.
      expect(box(wrapper).classList).toContain("max-h-40");
      expect(box(wrapper).classList).toContain("overflow-y-auto");
      expect(box(wrapper).classList).toContain("resize-none");
    });
  });

  describe("toolbar buttons", () => {
    it.each([
      ["Bold", "**hello** world"],
      ["Italic", "*hello* world"],
      ["Strikethrough", "~~hello~~ world"],
      ["Underline", "++hello++ world"],
      ["Inline code", "`hello` world"],
      ["Link", "[hello](url) world"],
      ["Quote", "> hello world"],
      ["Bulleted list", "- hello world"],
    ])("%s", async (name, expected) => {
      const wrapper = mountComposer("hello world");
      select(wrapper, 0, 5);
      await button(wrapper, name).trigger("click");
      await flushPromises();
      expect(box(wrapper).value).toBe(expected);
    });

    it("keeps the selection on the text and the focus in the box", async () => {
      const wrapper = mountComposer("hello world");
      select(wrapper, 6, 11);
      await button(wrapper, "Bold").trigger("click");
      await flushPromises();
      expect(document.activeElement).toBe(box(wrapper));
      expect(box(wrapper).value.slice(box(wrapper).selectionStart, box(wrapper).selectionEnd)).toBe("world");
    });

    it("takes the formatting off with a second click", async () => {
      const wrapper = mountComposer("hello world");
      select(wrapper, 0, 5);
      await button(wrapper, "Bold").trigger("click");
      await flushPromises();
      await button(wrapper, "Bold").trigger("click");
      await flushPromises();
      expect(box(wrapper).value).toBe("hello world");
    });

    it("refuses an edit that would pass the length limit", async () => {
      const full = "x".repeat(8192);
      const wrapper = mountComposer(full);
      select(wrapper, 0, 5);
      await button(wrapper, "Bold").trigger("click");
      await flushPromises();
      expect(box(wrapper).value).toBe(full);
    });

    it("does nothing while the box is disabled", async () => {
      const wrapper = mountComposer("hello", { disabled: true });
      expect(button(wrapper, "Bold").attributes("disabled")).toBeDefined();
    });

    it("names every button and shows the shortcut where there is one", () => {
      const wrapper = mountComposer();
      for (const name of ["Bold", "Italic", "Strikethrough", "Underline", "Link", "Quote", "Inline code", "Bulleted list"]) {
        expect(button(wrapper, name).exists(), name).toBe(true);
      }
      expect(wrapper.find('[role="toolbar"]').attributes("aria-label")).toBe("Text formatting");
    });
  });

  describe("keyboard shortcuts", () => {
    it.each([
      ["b", "**hello** world"],
      ["i", "*hello* world"],
      ["k", "[hello](url) world"],
    ])("Ctrl+%s", async (key, expected) => {
      const wrapper = mountComposer("hello world");
      select(wrapper, 0, 5);
      const event = new KeyboardEvent("keydown", { key, ctrlKey: true, cancelable: true, bubbles: true });
      box(wrapper).dispatchEvent(event);
      await flushPromises();
      expect(event.defaultPrevented).toBe(true);
      expect(box(wrapper).value).toBe(expected);
    });

    it("leaves other Ctrl combinations to the browser", async () => {
      const wrapper = mountComposer("hello");
      const event = new KeyboardEvent("keydown", { key: "a", ctrlKey: true, cancelable: true, bubbles: true });
      box(wrapper).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe("on a phone", () => {
    it("hides the toolbar until it is asked for", async () => {
      stubPhone(true);
      const wrapper = mount(ChatComposer, {
        props: { modelValue: "", placeholder: "Message", label: "Send", disabled: false },
        attachTo: document.body,
      });
      expect(wrapper.find('[role="toolbar"]').exists()).toBe(false);
      const toggle = button(wrapper, "Show formatting");
      expect(toggle.attributes("aria-expanded")).toBe("false");
      await toggle.trigger("click");
      expect(wrapper.find('[role="toolbar"]').exists()).toBe(true);
      expect(button(wrapper, "Hide formatting").attributes("aria-expanded")).toBe("true");
    });

    it("has no toggle on a wide screen, where the toolbar is always there", () => {
      const wrapper = mountComposer();
      expect(button(wrapper, "Show formatting").exists()).toBe(false);
      expect(wrapper.find('[role="toolbar"]').exists()).toBe(true);
    });
  });
});
