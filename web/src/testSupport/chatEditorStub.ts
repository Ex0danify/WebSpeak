import { defineComponent, h } from "vue";
import { vi } from "vitest";
import type { Selection } from "@/features/room/chat/composerFormat";

/**
 * Stands in for the chat editor, with the same few methods and events, so a test of the composer need not run CodeMirror.
 * `select` sets what `getSelection` reports.
 */
export const EditorStub = defineComponent({
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
