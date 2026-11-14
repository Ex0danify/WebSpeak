import type { StateCore, Token } from "markdown-it";

const MARK = "||";

interface Open {
  /** Index of the placeholder opening token in the output. */
  at: number;
  depth: number;
}

// `||hidden||` marker pairs inside one inline run. Runs after the inline pass so the text between the markers can carry
// other formatting, and before `text_join` so an escaped `\|\|` is still a separate token and never a marker. A pair
// has to open and close at the same nesting depth, or it would cross a link or emphasis boundary.
export function spoilerRule(state: StateCore): void {
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children?.some((t) => t.type === "text" && t.content.includes(MARK))) continue;
    block.children = pairMarkers(state, block.children);
  }
}

function pairMarkers(state: StateCore, children: Token[]): Token[] {
  const out: Token[] = [];
  const opens: Open[] = [];
  let depth = 0;

  const literal = (open: Open) => {
    const token = out[open.at]!;
    token.type = "text";
    token.tag = "";
    token.nesting = 0;
    token.content = MARK;
  };
  const make = (type: string, nesting: 1 | -1) => new state.Token(type, "span", nesting);
  const textToken = (content: string) => {
    const token = new state.Token("text", "", 0);
    token.content = content;
    return token;
  };
  const marker = () => {
    const open = opens.at(-1);
    if (open && open.depth === depth && open.at < out.length - 1) {
      opens.pop();
      out.push(make("spoiler_close", -1));
    } else if (open && open.depth === depth) {
      // `||||` holds nothing to hide, keep it as typed.
      opens.pop();
      literal(open);
      out.push(textToken(MARK));
    } else {
      opens.push({ at: out.length, depth });
      out.push(make("spoiler_open", 1));
    }
  };

  for (const child of children) {
    if (child.type === "text" && child.content.includes(MARK)) {
      child.content.split(MARK).forEach((part, index) => {
        if (index > 0) marker();
        if (part) out.push(textToken(part));
      });
      continue;
    }
    depth += child.nesting;
    out.push(child);
    // Leaving the element a marker was opened in leaves it unpaired.
    while (opens.length && opens.at(-1)!.depth > depth) literal(opens.pop()!);
  }
  for (const open of opens) literal(open);
  return out;
}
