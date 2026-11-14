import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { highlightTag, insertTag, spoilerTag } from "@/features/room/chat/editor/chatLanguage";

// The markers (`**`, `||`, the `>` of a quote) stay in the text and fade, the text between them takes the look it will have in
// the chat. Everything is set in the weight and size of the plain text, so the caret never drifts from what is drawn.
const quiet = "var(--color-fg-muted)";

const highlightStyle = HighlightStyle.define([
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: insertTag, textDecoration: "underline", textUnderlineOffset: "2px" },
  { tag: highlightTag, backgroundColor: "var(--color-warning-soft)", borderRadius: "2px" },
  { tag: spoilerTag, backgroundColor: "var(--color-line-strong)", borderRadius: "2px" },
  { tag: t.special(t.content), color: "var(--color-accent)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)" },
  { tag: t.heading, fontWeight: "700" },
  { tag: t.link, color: "var(--color-accent)", textDecoration: "underline", textUnderlineOffset: "2px" },
  { tag: t.url, color: quiet },
  { tag: t.quote, color: quiet },
  { tag: [t.processingInstruction, t.contentSeparator, t.list], color: quiet },
]);

const focusRing = "2px solid color-mix(in srgb, var(--color-accent) 55%, transparent)";

const theme = EditorView.theme({
  "&": { fontSize: "inherit", color: "inherit", backgroundColor: "transparent", minHeight: "2.25rem", borderRadius: "0.375rem" },
  // The ring sits on the editable element, inside its edge, because the scroll area around it would clip one drawn outside.
  "&.cm-focused": { outline: "none" },
  // `:focus`, not the editor's own focused class, which only appears after its next update.
  ".cm-content:focus": { outline: focusRing, outlineOffset: "-2px" },
  // The editor grows with its text up to this height, then scrolls inside.
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.5", maxHeight: "10rem", overflowY: "auto" },
  // The side padding leaves room for the ring, the row around the editor takes the same off its own.
  ".cm-content": { padding: "0.5rem", caretColor: "var(--color-fg)", borderRadius: "0.375rem" },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: quiet },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 30%, transparent)",
  },
  // The phone's touch target is 44 px.
  "@media (max-width: 740px)": { "&": { minHeight: "2.75rem" } },
});

export const chatEditorTheme = [theme, syntaxHighlighting(highlightStyle)];
