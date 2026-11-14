<template>
  <div ref="host" :class="cn('min-w-0', disabled && 'opacity-50')"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, insertNewline } from "@codemirror/commands";
import { chatLanguageSupport } from "@/features/room/chat/editor/chatLanguage";
import { chatEditorTheme } from "@/features/room/chat/editor/chatEditorTheme";
import type { Selection } from "@/features/room/chat/composerFormat";
import { cn } from "@/shared/lib/cn";

// The message box as a CodeMirror editor, so the text can show its formatting while it is typed. It is a text box to the
// outside: it has a name, a placeholder, a read-only state and one value. Enter asks to send and Shift+Enter breaks the
// line. The editor grows with its text up to the height in its theme and scrolls beyond that.
const props = defineProps<{
  /** Accessible name. */
  label: string;
  placeholder: string;
  disabled: boolean;
  /** The text is cut at this many characters, whether typed or pasted. */
  maxLength: number;
}>();
const emit = defineEmits<{
  (e: "submit"): void;
  /** A formatting shortcut was pressed. */
  (e: "shortcut", name: "bold" | "italic" | "link"): void;
}>();

const text = defineModel<string>({ default: "" });

const host = ref<HTMLElement | null>(null);
let view: EditorView | null = null;
const readOnly = new Compartment();
const attributes = new Compartment();
const placeholderText = new Compartment();

const contentAttributes = () =>
  EditorView.contentAttributes.of({
    "aria-label": props.label,
    "aria-disabled": props.disabled ? "true" : "false",
    spellcheck: "true",
    autocapitalize: "sentences",
    enterkeyhint: "send",
  });
const editable = () => [EditorView.editable.of(!props.disabled), EditorState.readOnly.of(props.disabled)];

// An input method that is still composing owns the Enter key.
const sendOnEnter = () => {
  if (view?.composing) return false;
  emit("submit");
  return true;
};
const shortcut = (name: "bold" | "italic" | "link") => () => {
  emit("shortcut", name);
  return true;
};

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: text.value,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: "Enter", run: sendOnEnter },
            { key: "Shift-Enter", run: insertNewline },
            { key: "Mod-b", run: shortcut("bold"), preventDefault: true },
            { key: "Mod-i", run: shortcut("italic"), preventDefault: true },
            { key: "Mod-k", run: shortcut("link"), preventDefault: true },
          ]),
        ),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        chatLanguageSupport(),
        chatEditorTheme,
        EditorState.transactionFilter.of((tr) =>
          tr.docChanged && tr.newDoc.length > props.maxLength
            ? [tr, { changes: { from: props.maxLength, to: tr.newDoc.length }, sequential: true }]
            : tr,
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) text.value = update.state.doc.toString();
        }),
        readOnly.of(editable()),
        attributes.of(contentAttributes()),
        placeholderText.of(placeholderExtension(props.placeholder)),
      ],
    }),
  });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

watch(text, (next) => {
  if (!view || next === view.state.doc.toString()) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
});
watch(
  () => props.disabled,
  () => view?.dispatch({ effects: [readOnly.reconfigure(editable()), attributes.reconfigure(contentAttributes())] }),
);
watch(
  () => props.label,
  () => view?.dispatch({ effects: attributes.reconfigure(contentAttributes()) }),
);
watch(
  () => props.placeholder,
  (next) => view?.dispatch({ effects: placeholderText.reconfigure(placeholderExtension(next)) }),
);

/** The text and what is selected in it, for the formatting actions. */
function getSelection(): Selection {
  const { doc, selection } = view!.state;
  return { text: doc.toString(), start: selection.main.from, end: selection.main.to };
}

/**
 * Shows `next` as the new text and selection. Only the part that differs is replaced, so the undo history holds one step per
 * action and the rest of the text keeps its place.
 */
function apply(next: Selection) {
  if (!view) return;
  const current = view.state.doc.toString();
  const limit = Math.min(current.length, next.text.length);
  let from = 0;
  while (from < limit && current[from] === next.text[from]) from++;
  let tail = 0;
  while (tail < limit - from && current[current.length - 1 - tail] === next.text[next.text.length - 1 - tail]) tail++;
  view.dispatch({
    changes: { from, to: current.length - tail, insert: next.text.slice(from, next.text.length - tail) },
    selection: { anchor: next.start, head: next.end },
    userEvent: "input",
    scrollIntoView: true,
  });
  view.focus();
}

defineExpose({ focus: () => view?.focus(), getSelection, apply });
</script>
