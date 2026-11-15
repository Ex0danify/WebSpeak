import { describe, expect, it } from "vitest";
import {
  HEADING_PREFIX,
  LIST_PREFIX,
  QUOTE_PREFIX,
  TABLE_TEMPLATE,
  headingMarker,
  insertStandalone,
  isBullet,
  makeLink,
  toggleLinePrefix,
  toggleWrap,
  wrapBlock,
  type Selection,
} from "@/features/room/chat/composerFormat";

// `⟦a⟧` marks the selected text and `|` a caret, so a case reads as before and after.
function sel(marked: string): Selection {
  const open = marked.indexOf("⟦");
  if (open !== -1) {
    const close = marked.indexOf("⟧");
    return { text: marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1), start: open, end: close - 1 };
  }
  const caret = marked.indexOf("|");
  if (caret === -1) throw new Error(`no selection or caret marker in "${marked}"`);
  // Cut out the one marker at its position, the text itself may hold other pipes.
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), start: caret, end: caret };
}
function show({ text, start, end }: Selection): string {
  if (start === end) return `${text.slice(0, start)}|${text.slice(start)}`;
  return `${text.slice(0, start)}⟦${text.slice(start, end)}⟧${text.slice(end)}`;
}

describe("toggleWrap", () => {
  it.each([
    ["wraps a selection", "a ⟦b⟧ c", "**", "a **⟦b⟧** c"],
    ["puts the caret between the markers", "a |c", "**", "a **|**c"],
    ["takes markers off inside the selection", "a ⟦**b**⟧ c", "**", "a ⟦b⟧ c"],
    ["takes markers off around the selection", "a **⟦b⟧** c", "**", "a ⟦b⟧ c"],
    ["closes an empty pair again", "a **|** c", "**", "a | c"],
    ["wraps in a different marker", "⟦b⟧", "~~", "~~⟦b⟧~~"],
    ["underline", "⟦b⟧", "++", "++⟦b⟧++"],
    ["highlight", "⟦b⟧", "==", "==⟦b⟧=="],
    ["spoiler", "⟦b⟧", "||", "||⟦b⟧||"],
    ["italic", "⟦b⟧", "*", "*⟦b⟧*"],
    ["italic around bold keeps the bold", "**⟦b⟧**", "*", "***⟦b⟧***"],
    ["italic inside bold selection keeps the bold", "⟦**b**⟧", "*", "*⟦**b**⟧*"],
    ["italic off again leaves the bold", "***⟦b⟧***", "*", "**⟦b⟧**"],
  ])("%s", (_name, before, marker, after) => {
    expect(show(toggleWrap(sel(before), marker))).toBe(after);
  });

  it("works on a selection in the middle of a longer text", () => {
    expect(show(toggleWrap(sel("one two ⟦three⟧ four"), "`"))).toBe("one two `⟦three⟧` four");
  });
});

describe("toggleLinePrefix", () => {
  const bullet = () => "- ";
  const quote = () => "> ";
  const number = (index: number) => `${index + 1}. `;

  it.each([
    ["quotes a line from the caret", "ab|c", quote, QUOTE_PREFIX, "> ab|c"],
    ["quotes every selected line", "⟦one\ntwo⟧", quote, QUOTE_PREFIX, "⟦> one\n> two⟧"],
    ["touches the whole line for a partial selection", "o⟦n⟧e\ntwo", quote, QUOTE_PREFIX, "⟦> one⟧\ntwo"],
    ["leaves lines outside the selection alone", "a\n⟦b⟧\nc", quote, QUOTE_PREFIX, "a\n⟦> b⟧\nc"],
    ["takes the quote off again", "⟦> one\n> two⟧", quote, QUOTE_PREFIX, "⟦one\ntwo⟧"],
    ["adds to the lines that miss it", "⟦> one\ntwo⟧", quote, QUOTE_PREFIX, "⟦> one\n> two⟧"],
    ["bullets", "⟦a\nb⟧", bullet, LIST_PREFIX, "⟦- a\n- b⟧"],
    ["numbers the lines", "⟦a\nb\nc⟧", number, LIST_PREFIX, "⟦1. a\n2. b\n3. c⟧"],
    ["numbering skips blank lines", "⟦a\n\nb⟧", number, LIST_PREFIX, "⟦1. a\n\n2. b⟧"],
    ["a bullet list becomes numbered", "⟦- a\n- b⟧", number, LIST_PREFIX, "⟦1. a\n2. b⟧"],
    ["does not mark a blank line between items", "⟦a\n\nb⟧", bullet, LIST_PREFIX, "⟦- a\n\n- b⟧"],
    ["marks an empty line when it is the only one", "|", bullet, LIST_PREFIX, "- |"],
    ["leaves out the next line after a trailing break", "⟦a\n⟧b", quote, QUOTE_PREFIX, "⟦> a⟧\nb"],
  ])("%s", (_name, before, marker, strip, after) => {
    const input = sel(before);
    // A selection that ends after a break is easier to write as indexes.
    if (before.includes("⟦a\n⟧b")) Object.assign(input, { start: 0, end: 2 });
    expect(show(toggleLinePrefix(input, marker, strip))).toBe(after);
  });

  it("turns a heading into another level instead of removing it", () => {
    expect(show(toggleLinePrefix(sel("# ⟦title⟧"), headingMarker(2), HEADING_PREFIX))).toBe("⟦## title⟧");
  });

  it("removes a heading of the same level", () => {
    expect(show(toggleLinePrefix(sel("## ⟦title⟧"), headingMarker(2), HEADING_PREFIX))).toBe("⟦title⟧");
  });

  it("makes task items out of bullets and back", () => {
    const task = () => "- [ ] ";
    expect(show(toggleLinePrefix(sel("⟦- a\n- b⟧"), task, LIST_PREFIX))).toBe("⟦- [ ] a\n- [ ] b⟧");
    expect(show(toggleLinePrefix(sel("⟦- [ ] a⟧"), task, LIST_PREFIX))).toBe("⟦a⟧");
  });

  it("does not take the dash off a task item when toggling bullets", () => {
    expect(show(toggleLinePrefix(sel("⟦- [ ] a⟧"), bullet, LIST_PREFIX, isBullet))).toBe("⟦- a⟧");
  });
});

describe("wrapBlock", () => {
  it.each([
    ["fences the selection", "⟦code⟧", "```", "```", "```\n⟦code⟧\n```"],
    ["opens an empty fence with the caret inside", "|", "```", "```", "```\n|\n```"],
    ["starts on a line of its own", "text ⟦code⟧", "```", "```", "text \n```\n⟦code⟧\n```"],
    ["ends on a line of its own", "⟦code⟧ more", "```", "```", "```\n⟦code⟧\n```\n more"],
    ["a container", "⟦hello⟧", ":::center", ":::", ":::center\n⟦hello⟧\n:::"],
    ["a details block", "|", ":::details ", ":::", ":::details \n|\n:::"],
  ])("%s", (_name, before, head, tail, after) => {
    expect(show(wrapBlock(sel(before), head, tail))).toBe(after);
  });
});

describe("insertStandalone", () => {
  it.each([
    ["a rule after text gets a blank line before it", "text|", "---", "text\n\n---|"],
    ["a rule in an empty message", "|", "---", "---|"],
    ["a rule between lines", "a|\nb", "---", "a\n\n---|\n\nb"],
    ["after a selection, which stays", "⟦a⟧", "---", "a\n\n---|"],
    ["a blank line already there is enough", "a\n\n|", "---", "a\n\n---|"],
  ])("%s", (_name, before, snippet, after) => {
    expect(show(insertStandalone(sel(before), snippet))).toBe(after);
  });

  it("puts the caret in the first cell of a table", () => {
    const out = insertStandalone(sel("|"), TABLE_TEMPLATE, 2);
    expect(out.text).toBe("|  |  |\n| --- | --- |\n|  |  |");
    expect(out.start).toBe(2);
  });
});

describe("makeLink", () => {
  it.each([
    ["selects url to type over", "see ⟦docs⟧ now", "see [docs](⟦url⟧) now"],
    ["an empty selection opens the text part", "|", "[|](url)"],
    ["a pasted address moves into the parentheses", "⟦https://example.com/a?b=1⟧", "[|](https://example.com/a?b=1)"],
    ["text that is not an address stays the label", "⟦example.com⟧", "[example.com](⟦url⟧)"],
  ])("%s", (_name, before, after) => {
    expect(show(makeLink(sel(before)))).toBe(after);
  });
});
