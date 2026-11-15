import { Language, LanguageSupport, defineLanguageFacet } from "@codemirror/language";
import { GFM, Subscript, Superscript, parser, type MarkdownConfig } from "@lezer/markdown";
import { Tag, tags } from "@lezer/highlight";

// The syntax tree of the message box. It follows the TeamSpeak 6 chat syntax, so what the box colors is what the chat shows:
// CommonMark and GFM (strike, tables, task lists) from lezer, plus the markers lezer does not know.
export const insertTag = Tag.define("insert");
export const highlightTag = Tag.define("highlight");
export const spoilerTag = Tag.define("spoiler");

/** A `char`-doubled marker that wraps text, like `++underline++`. Flanking follows the rules of lezer's own strikethrough. */
function pairedMarker(name: string, char: number, tag: Tag): MarkdownConfig {
  const delimiter = { resolve: name, mark: `${name}Mark` };
  return {
    defineNodes: [
      { name, style: { [`${name}/...`]: tag } },
      { name: `${name}Mark`, style: tags.processingInstruction },
    ],
    parseInline: [
      {
        name,
        parse(cx, next, pos) {
          if (next !== char || cx.char(pos + 1) !== char || cx.char(pos + 2) === char) return -1;
          const spaceBefore = /\s|^$/.test(cx.slice(pos - 1, pos));
          const spaceAfter = /\s|^$/.test(cx.slice(pos + 2, pos + 3));
          return cx.addDelimiter(delimiter, pos, pos + 2, !spaceAfter, !spaceBefore);
        },
        after: "Emphasis",
      },
    ],
  };
}

/** The `:::center` and `:::` lines around aligned and collapsible blocks. The block's text stays ordinary markdown. */
const containerFence: MarkdownConfig = {
  defineNodes: [{ name: "ContainerFence", style: tags.processingInstruction }],
  parseBlock: [
    {
      name: "ContainerFence",
      parse(cx, line) {
        if (!line.text.startsWith(":::", line.pos)) return false;
        cx.addElement(cx.elt("ContainerFence", cx.lineStart + line.pos, cx.lineStart + line.text.length));
        cx.nextLine();
        return true;
      },
      // The closing `:::` comes right under the text, which would otherwise read as more of the paragraph.
      endLeaf: (_cx, line) => line.text.startsWith(":::", line.pos),
      before: "ATXHeading",
    },
  ],
};

export const chatParser = parser.configure([
  GFM,
  Subscript,
  Superscript,
  pairedMarker("Insert", 43, insertTag),
  pairedMarker("Highlight", 61, highlightTag),
  pairedMarker("Spoiler", 124, spoilerTag),
  containerFence,
]);

const chatLanguage = new Language(defineLanguageFacet(), chatParser, [], "chat");

export const chatLanguageSupport = (): LanguageSupport => new LanguageSupport(chatLanguage);
