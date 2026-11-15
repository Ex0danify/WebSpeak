import { describe, expect, it } from "vitest";
import { chatParser } from "@/features/room/chat/editor/chatLanguage";

/** The nodes of `source` that are not plain structure, as `Name[text]`. */
function nodes(source: string, only?: string[]): string[] {
  const found: string[] = [];
  chatParser.parse(source).iterate({
    enter(node) {
      if (node.name === "Document" || node.name === "Paragraph") return;
      if (only && !only.includes(node.name)) return;
      found.push(`${node.name}[${source.slice(node.from, node.to)}]`);
    },
  });
  return found;
}

describe("chat syntax tree", () => {
  it.each([
    ["bold", "**b**", "StrongEmphasis[**b**]"],
    ["italic", "*i*", "Emphasis[*i*]"],
    ["strike", "~~s~~", "Strikethrough[~~s~~]"],
    ["underline", "++u++", "Insert[++u++]"],
    ["highlight", "==h==", "Highlight[==h==]"],
    ["spoiler", "||s||", "Spoiler[||s||]"],
    ["superscript", "2^10^", "Superscript[^10^]"],
    ["subscript", "H~2~O", "Subscript[~2~]"],
    ["inline code", "`c`", "InlineCode[`c`]"],
    ["link", "[t](https://x.io)", "Link[[t](https://x.io)]"],
  ])("%s", (_name, source, expected) => {
    expect(nodes(source)).toContain(expected);
  });

  it("keeps the markers apart from the text, so they can be dimmed", () => {
    expect(nodes("++u++", ["InsertMark"])).toEqual(["InsertMark[++]", "InsertMark[++]"]);
    expect(nodes("||s||", ["SpoilerMark"])).toEqual(["SpoilerMark[||]", "SpoilerMark[||]"]);
    expect(nodes("==h==", ["HighlightMark"])).toEqual(["HighlightMark[==]", "HighlightMark[==]"]);
  });

  it("formats inside another format", () => {
    expect(nodes("**bold *both***")).toEqual(expect.arrayContaining(["StrongEmphasis[**bold *both***]", "Emphasis[*both*]"]));
    expect(nodes("||**x**||")).toEqual(expect.arrayContaining(["Spoiler[||**x**||]", "StrongEmphasis[**x**]"]));
  });

  it.each([
    ["an unclosed underline", "a ++b"],
    ["an unclosed spoiler", "a ||b"],
    ["a marker with spaces inside", "a ++ b ++ c"],
  ])("%s is plain text", (_name, source) => {
    expect(nodes(source, ["Insert", "Spoiler"])).toEqual([]);
  });

  it.each([
    ["heading", "# One", "ATXHeading1[# One]"],
    ["deeper heading", "### Three", "ATXHeading3[### Three]"],
    ["quote", "> q", "Blockquote[> q]"],
    ["bullet list", "- a", "BulletList[- a]"],
    ["ordered list", "1. a", "OrderedList[1. a]"],
    ["task item", "- [x] t", "TaskMarker[[x]]"],
    ["fenced code", "```js\ncode\n```", "FencedCode[```js\ncode\n```]"],
    ["thematic break", "a\n\n---", "HorizontalRule[---]"],
    ["table", "| a | b |\n| - | - |\n| 1 | 2 |", "Table[| a | b |\n| - | - |\n| 1 | 2 |]"],
  ])("%s", (_name, source, expected) => {
    expect(nodes(source)).toContain(expected);
  });

  it("marks the fence lines of a container and leaves the text ordinary", () => {
    const found = nodes(":::center\n**x**\n:::");
    expect(found).toEqual(expect.arrayContaining(["ContainerFence[:::center]", "ContainerFence[:::]", "StrongEmphasis[**x**]"]));
  });

  it("does not mistake a line that merely contains colons for a container", () => {
    expect(nodes("a ::: b", ["ContainerFence"])).toEqual([]);
  });

  it("never throws on odd input", () => {
    for (const source of ["", "\n\n", "|||||", "++++", "====", ":::", "[", "](", "**", "~~~~~", "> > > >", "x".repeat(20_000)]) {
      expect(() => chatParser.parse(source)).not.toThrow();
    }
  });
});
