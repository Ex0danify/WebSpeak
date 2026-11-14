/** The composer text with the selected range. A collapsed selection (`start === end`) is a caret. */
export interface Selection {
  text: string;
  start: number;
  end: number;
}

const result = (text: string, start: number, end = start): Selection => ({ text, start, end });

const odd = (count: number) => count % 2 === 1;
function runAtStart(value: string, char: string): number {
  let count = 0;
  while (value[count] === char) count++;
  return count;
}
function runAtEnd(value: string, char: string): number {
  let count = 0;
  while (value[value.length - 1 - count] === char) count++;
  return count;
}

/**
 * Wraps the selection in `open`/`close`, or takes the markers off again when they are already there, inside the
 * selection or right around it. Without a selection the caret ends up between the markers.
 */
export function toggleWrap(sel: Selection, open: string, close = open): Selection {
  const { text, start, end } = sel;
  const inner = text.slice(start, end);
  // `*` is part of `**`, and `~` of `~~`. A run of the marker char counts as this marker when it is odd (`***` is bold and
  // italic), so the shorter marker is told apart from the longer one.
  const single = open === close && open.length === 1;

  const inside = single
    ? inner.length >= 2 && odd(Math.min(runAtStart(inner, open), runAtEnd(inner, open)))
    : inner.length >= open.length + close.length && inner.startsWith(open) && inner.endsWith(close);
  if (inside) {
    const bare = inner.slice(open.length, inner.length - close.length);
    return result(text.slice(0, start) + bare + text.slice(end), start, start + bare.length);
  }

  const around = single
    ? odd(Math.min(runAtEnd(text.slice(0, start), open), runAtStart(text.slice(end), open)))
    : start >= open.length && text.startsWith(open, start - open.length) && text.startsWith(close, end);
  if (around) {
    const from = start - open.length;
    return result(text.slice(0, from) + inner + text.slice(end + close.length), from, from + inner.length);
  }

  return result(text.slice(0, start) + open + inner + close + text.slice(end), start + open.length, end + open.length);
}

/**
 * Puts `marker(index)` in front of every line the selection touches, replacing a prefix `strip` recognizes. When all those
 * lines already carry the marker it is removed instead. The selection then covers the changed lines, or the caret keeps
 * its place in the line.
 */
export function toggleLinePrefix(
  sel: Selection,
  marker: (index: number) => string,
  strip: RegExp,
  has: (line: string, marker: string) => boolean = (line, prefix) => line.startsWith(prefix),
): Selection {
  const { text, start, end } = sel;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  // A selection that ends right after a line break does not include the next line.
  const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const found = text.indexOf("\n", last);
  const lineEnd = found === -1 ? text.length : found;

  const lines = text.slice(lineStart, lineEnd).split("\n");
  // Blank lines between items stay blank, and numbering counts the lines that carry text.
  const filled = lines.filter((line) => line.trim() !== "");
  const remove = filled.length > 0 && filled.every((line, index) => has(line, marker(index)));
  let counted = 0;
  const changed = lines.map((line) => {
    if (filled.length > 0 && line.trim() === "") return line;
    const prefix = marker(counted++);
    return remove ? line.slice(prefix.length) : prefix + line.replace(strip, "");
  });
  const block = changed.join("\n");
  const next = text.slice(0, lineStart) + block + text.slice(lineEnd);

  if (start !== end) return result(next, lineStart, lineStart + block.length);
  const caret = Math.max(lineStart, start + block.length - (lineEnd - lineStart));
  return result(next, caret);
}

// A block element needs its own lines, and a `---` right under a line of text would turn that line into a heading.
const lineGap = (before: string): string => (before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n");
const lineGapAfter = (after: string): string => (after === "" || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n");

/** `head`, the selection and `tail` on lines of their own, as for a code fence or a `:::` container. */
export function wrapBlock(sel: Selection, head: string, tail: string): Selection {
  const { text, start, end } = sel;
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before === "" || before.endsWith("\n") ? "" : "\n";
  const trail = after === "" || after.startsWith("\n") ? "" : "\n";
  const inner = text.slice(start, end);
  const open = `${lead}${head}\n`;
  return result(
    `${before}${open}${inner}\n${tail}${trail}${after}`,
    before.length + open.length,
    before.length + open.length + inner.length,
  );
}

/** `snippet` as a paragraph of its own after the selection, which stays untouched. The caret goes to `caret` inside it. */
export function insertStandalone(sel: Selection, snippet: string, caret = snippet.length): Selection {
  const before = sel.text.slice(0, sel.end);
  const after = sel.text.slice(sel.end);
  const lead = lineGap(before);
  const at = before.length + lead.length;
  return result(`${before}${lead}${snippet}${lineGapAfter(after)}${after}`, at + caret);
}

const BARE_URL = /^https?:\/\/\S+$/i;

/** `[text](url)` around the selection with `url` selected to type over, or the pasted address moved into the parentheses. */
export function makeLink(sel: Selection): Selection {
  const { text, start, end } = sel;
  const inner = text.slice(start, end);
  const rest = text.slice(end);
  const before = text.slice(0, start);
  if (BARE_URL.test(inner)) return result(`${before}[](${inner})${rest}`, start + 1);
  if (inner === "") return result(`${before}[](url)${rest}`, start + 1);
  const from = start + inner.length + 3;
  return result(`${before}[${inner}](url)${rest}`, from, from + 3);
}

export const headingMarker = (level: number) => () => `${"#".repeat(level)} `;
export const HEADING_PREFIX = /^#{1,6} /;
export const QUOTE_PREFIX = /^> ?/;
/** Any list marker, so a bullet list can become a numbered or task list and the other way round. */
export const LIST_PREFIX = /^(?:\d+\. |[-*+] (?:\[[ xX]\] )?)/;
const TASK_PREFIX = /^[-*+] \[[ xX]\] /;
/** A plain bullet line, not a task item, which also starts with `- `. */
export const isBullet = (line: string, marker: string) => line.startsWith(marker) && !TASK_PREFIX.test(line);

export const TABLE_TEMPLATE = "|  |  |\n| --- | --- |\n|  |  |";
