import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import ChatEditor from "@/features/room/chat/editor/ChatEditor.vue";

// Real CodeMirror in happy-dom. There is no layout there, so the parts that measure (scrolling, caret rectangles) are left to
// the e2e tests, and only what happy-dom can answer is checked here: the value, the keys, the limits and the text box semantics.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () =>
    ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

interface Handle {
  focus(): void;
  getSelection(): { text: string; start: number; end: number };
  apply(next: { text: string; start: number; end: number }): void;
}

function mountEditor(initial = "", props: Partial<{ disabled: boolean; maxLength: number }> = {}) {
  const wrapper: VueWrapper = mount(ChatEditor, {
    props: {
      modelValue: initial,
      "onUpdate:modelValue": (next: string) => wrapper.setProps({ modelValue: next }),
      label: "Send",
      placeholder: "Message",
      disabled: false,
      maxLength: 100,
      ...props,
    },
    attachTo: document.body,
  });
  const content = wrapper.find(".cm-content").element as HTMLElement;
  const view = EditorView.findFromDOM(wrapper.element as HTMLElement)!;
  return { wrapper, content, view, handle: wrapper.vm as unknown as Handle };
}

const key = (target: HTMLElement, init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe("ChatEditor", () => {
  describe("as a text box", () => {
    it("is a named multi-line textbox", () => {
      const { content } = mountEditor();
      expect(content.getAttribute("role")).toBe("textbox");
      expect(content.getAttribute("aria-multiline")).toBe("true");
      expect(content.getAttribute("aria-label")).toBe("Send");
      expect(content.getAttribute("contenteditable")).toBe("true");
    });

    it("shows the placeholder while empty", () => {
      expect(mountEditor().wrapper.find(".cm-placeholder").text()).toBe("Message");
    });

    it("checks spelling and asks the phone keyboard for a send key", () => {
      const { content } = mountEditor();
      expect(content.getAttribute("spellcheck")).toBe("true");
      expect(content.getAttribute("enterkeyhint")).toBe("send");
    });

    it("stops being editable and says so when blocked, and follows when unblocked", async () => {
      const { wrapper, content } = mountEditor("", { disabled: true });
      expect(content.getAttribute("contenteditable")).toBe("false");
      expect(content.getAttribute("aria-disabled")).toBe("true");
      await wrapper.setProps({ disabled: false });
      expect(content.getAttribute("contenteditable")).toBe("true");
      expect(content.getAttribute("aria-disabled")).toBe("false");
    });

    it("follows a new name and placeholder", async () => {
      const { wrapper, content } = mountEditor();
      await wrapper.setProps({ label: "No permission to write here", placeholder: "Blocked" });
      expect(content.getAttribute("aria-label")).toBe("No permission to write here");
      expect(wrapper.find(".cm-placeholder").text()).toBe("Blocked");
    });
  });

  describe("value", () => {
    it("starts with the text it is given", () => {
      expect(mountEditor("hello").view.state.doc.toString()).toBe("hello");
    });

    it("reports what is typed", async () => {
      const { wrapper, view } = mountEditor();
      view.dispatch({ changes: { from: 0, insert: "typed" }, userEvent: "input.type" });
      await flushPromises();
      expect((wrapper.props() as { modelValue: string }).modelValue).toBe("typed");
    });

    it("shows a value set from outside, such as the box emptied after sending", async () => {
      const { wrapper, view } = mountEditor("sent");
      await wrapper.setProps({ modelValue: "" });
      expect(view.state.doc.toString()).toBe("");
    });
  });

  describe("keys", () => {
    it("Enter asks to send and adds no line", () => {
      const { wrapper, content, view } = mountEditor("hello");
      const event = key(content, { key: "Enter" });
      expect(wrapper.emitted("submit")).toHaveLength(1);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("hello");
    });

    it("Shift+Enter breaks the line and does not send", () => {
      const { wrapper, content, view } = mountEditor("hello");
      view.dispatch({ selection: { anchor: 5 } });
      key(content, { key: "Enter", shiftKey: true });
      expect(wrapper.emitted("submit")).toBeUndefined();
      expect(view.state.doc.toString()).toBe("hello\n");
    });

    it.each([
      ["b", "bold"],
      ["i", "italic"],
      ["k", "link"],
    ])("Ctrl+%s is the %s shortcut", (letter, name) => {
      const { wrapper, content } = mountEditor("hello");
      const event = key(content, { key: letter, ctrlKey: true });
      expect(wrapper.emitted("shortcut")).toEqual([[name]]);
      expect(event.defaultPrevented).toBe(true);
    });

    it("leaves other shortcuts alone", () => {
      const { wrapper, content } = mountEditor("hello");
      key(content, { key: "j", ctrlKey: true });
      expect(wrapper.emitted("shortcut")).toBeUndefined();
    });
  });

  describe("length limit", () => {
    it("cuts typed or pasted text at the limit", async () => {
      const { wrapper, view } = mountEditor("", { maxLength: 10 });
      view.dispatch({ changes: { from: 0, insert: "x".repeat(25) }, userEvent: "input.paste" });
      await flushPromises();
      expect(view.state.doc.toString()).toBe("x".repeat(10));
      expect((wrapper.props() as { modelValue: string }).modelValue).toBe("x".repeat(10));
    });

    it("lets a text exactly at the limit stand", () => {
      const { view } = mountEditor("", { maxLength: 10 });
      view.dispatch({ changes: { from: 0, insert: "x".repeat(10) } });
      expect(view.state.doc.length).toBe(10);
    });
  });

  describe("for the formatting buttons", () => {
    // happy-dom reports a changed selection in the middle of the call that changed it, a browser does it later, and CodeMirror
    // cannot take that from inside its own update. Without the real focus it leaves the DOM selection alone. That the box
    // takes the focus is checked in the browser tests.
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => {});
    });

    it("reads the text and the selection", () => {
      const { view, handle } = mountEditor("hello world");
      view.dispatch({ selection: { anchor: 6, head: 11 } });
      expect(handle.getSelection()).toEqual({ text: "hello world", start: 6, end: 11 });
    });

    it("replaces only what changed and selects what it is told to", () => {
      const { view, handle } = mountEditor("hello world");
      handle.apply({ text: "hello **world**", start: 8, end: 13 });
      expect(view.state.doc.toString()).toBe("hello **world**");
      expect(view.state.selection.main).toMatchObject({ from: 8, to: 13 });
    });

    it("is one undo step", () => {
      const { view, handle } = mountEditor("hello world");
      handle.apply({ text: "**hello** world", start: 2, end: 7 });
      undo(view);
      expect(view.state.doc.toString()).toBe("hello world");
    });

    it("handles text that shrinks, grows and is replaced whole", () => {
      const { view, handle } = mountEditor("**a**");
      handle.apply({ text: "a", start: 0, end: 1 });
      expect(view.state.doc.toString()).toBe("a");
      handle.apply({ text: "a b c", start: 5, end: 5 });
      expect(view.state.doc.toString()).toBe("a b c");
      handle.apply({ text: "zzz", start: 0, end: 3 });
      expect(view.state.doc.toString()).toBe("zzz");
    });
  });

  describe("formatting while typing", () => {
    it("styles the text between the markers and fades the markers", () => {
      const { wrapper } = mountEditor("**bold** and ++under++ and ||spoiler||");
      const classes = wrapper.findAll(".cm-line span").map((span) => span.classes().join(" "));
      // One generated class per look. The markers and the text between them are different spans, so they differ.
      expect(new Set(classes).size).toBeGreaterThan(3);
    });
  });
});
