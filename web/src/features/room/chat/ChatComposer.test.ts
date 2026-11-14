import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ChatComposer from "@/features/room/chat/ChatComposer.vue";
import type { Selection } from "@/features/room/chat/composerFormat";

// The editor itself is tested against CodeMirror in ChatEditor.test.ts. Here a stand-in with the same few methods keeps the
// composer's own work in view: what a button or a shortcut does to the text and selection, and when Send is possible.
const EditorStub = defineComponent({
  props: { modelValue: { type: String, default: "" }, label: String, placeholder: String, disabled: Boolean, maxLength: Number },
  emits: ["update:modelValue", "submit", "shortcut"],
  setup(props, { expose, emit }) {
    const range = { start: 0, end: 0 };
    expose({
      focus: vi.fn(),
      select: (start: number, end: number) => Object.assign(range, { start, end }),
      getSelection: (): Selection => ({ text: props.modelValue, ...range }),
      apply: (next: Selection) => {
        Object.assign(range, { start: next.start, end: next.end });
        emit("update:modelValue", next.text);
      },
    });
    return () => h("div", { "data-editor": "", "aria-label": props.label });
  },
});

function stubPhone(phone: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: phone, addEventListener: () => {}, removeEventListener: () => {} }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function mountComposer(value = "", props: { disabled?: boolean; phone?: boolean } = {}) {
  stubPhone(props.phone ?? false);
  const wrapper: VueWrapper = mount(ChatComposer, {
    props: {
      modelValue: value,
      "onUpdate:modelValue": (next: string) => wrapper.setProps({ modelValue: next }),
      placeholder: "Message",
      label: "Send",
      disabled: props.disabled ?? false,
    },
    global: { stubs: { ChatEditor: EditorStub } },
    attachTo: document.body,
  });
  return wrapper;
}

const editor = (wrapper: VueWrapper) => wrapper.findComponent(EditorStub);
const button = (wrapper: VueWrapper, name: string) => wrapper.find(`button[aria-label="${name}"]`);
const select = (wrapper: VueWrapper, start: number, end: number) =>
  (editor(wrapper).vm as unknown as { select: (start: number, end: number) => void }).select(start, end);
const value = (wrapper: VueWrapper) => (wrapper.props() as { modelValue: string }).modelValue;

describe("ChatComposer", () => {
  describe("the editor", () => {
    it("is named, labelled and limited by the composer", () => {
      const wrapper = mountComposer();
      expect(editor(wrapper).props()).toMatchObject({ label: "Send", placeholder: "Message", disabled: false, maxLength: 8192 });
    });

    it("passes a blocked state on", () => {
      expect(editor(mountComposer("", { disabled: true })).props("disabled")).toBe(true);
    });
  });

  describe("sending", () => {
    it("sends when the editor asks to", () => {
      const wrapper = mountComposer("hello");
      editor(wrapper).vm.$emit("submit");
      expect(wrapper.emitted("submit")).toHaveLength(1);
    });

    it.each([
      ["an empty box", mountComposer("")],
      ["a blank box", mountComposer("   \n ")],
      ["a blocked box", mountComposer("text", { disabled: true })],
    ])("does not send %s", (_name, wrapper) => {
      editor(wrapper).vm.$emit("submit");
      expect(wrapper.emitted("submit")).toBeUndefined();
    });

    it("keeps Send off until there is text", () => {
      expect(button(mountComposer(""), "Send").attributes("disabled")).toBeDefined();
      expect(button(mountComposer("hi"), "Send").attributes("disabled")).toBeUndefined();
    });

    it("sends from the Send button", async () => {
      const wrapper = mountComposer("hello");
      await wrapper.find("form").trigger("submit");
      expect(wrapper.emitted("submit")).toHaveLength(1);
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
      expect(value(wrapper)).toBe(expected);
    });

    it("takes the formatting off with a second click", async () => {
      const wrapper = mountComposer("hello world");
      select(wrapper, 0, 5);
      await button(wrapper, "Bold").trigger("click");
      await flushPromises();
      await button(wrapper, "Bold").trigger("click");
      await flushPromises();
      expect(value(wrapper)).toBe("hello world");
    });

    it("refuses an edit that would pass the length limit", async () => {
      const full = "x".repeat(8192);
      const wrapper = mountComposer(full);
      select(wrapper, 0, 5);
      await button(wrapper, "Bold").trigger("click");
      await flushPromises();
      expect(value(wrapper)).toBe(full);
    });

    it("does nothing while the box is blocked", () => {
      const wrapper = mountComposer("hello", { disabled: true });
      expect(button(wrapper, "Bold").attributes("disabled")).toBeDefined();
    });

    it("names every button", () => {
      const wrapper = mountComposer();
      for (const name of ["Bold", "Italic", "Strikethrough", "Underline", "Link", "Quote", "Inline code", "Bulleted list"]) {
        expect(button(wrapper, name).exists(), name).toBe(true);
      }
      expect(wrapper.find('[role="toolbar"]').attributes("aria-label")).toBe("Text formatting");
    });
  });

  describe("shortcuts", () => {
    it.each([
      ["bold", "**hello** world"],
      ["italic", "*hello* world"],
      ["link", "[hello](url) world"],
    ])("%s from the editor", async (name, expected) => {
      const wrapper = mountComposer("hello world");
      select(wrapper, 0, 5);
      editor(wrapper).vm.$emit("shortcut", name);
      await flushPromises();
      expect(value(wrapper)).toBe(expected);
    });
  });

  describe("on a phone", () => {
    it("hides the toolbar until it is asked for", async () => {
      const wrapper = mountComposer("", { phone: true });
      expect(wrapper.find('[role="toolbar"]').exists()).toBe(false);
      const toggle = button(wrapper, "Show formatting");
      expect(toggle.attributes("aria-expanded")).toBe("false");
      await toggle.trigger("click");
      expect(wrapper.find('[role="toolbar"]').exists()).toBe(true);
      expect(button(wrapper, "Hide formatting").attributes("aria-expanded")).toBe("true");
    });

    it("hands the focus back to the editor after an edit, once the menu sheet has closed", async () => {
      vi.useFakeTimers();
      const wrapper = mountComposer("hello", { phone: true });
      await button(wrapper, "Show formatting").trigger("click");
      select(wrapper, 0, 5);
      const focus = (editor(wrapper).vm as unknown as { focus: ReturnType<typeof vi.fn> }).focus;
      await button(wrapper, "Bold").trigger("click");
      focus.mockClear();
      vi.runAllTimers();
      expect(focus).toHaveBeenCalled();
    });

    it("has no toggle on a wide screen, where the toolbar is always there", () => {
      const wrapper = mountComposer();
      expect(button(wrapper, "Show formatting").exists()).toBe(false);
      expect(wrapper.find('[role="toolbar"]').exists()).toBe(true);
    });
  });
});
