import MarkdownIt, { type Token } from "markdown-it";
import { alert } from "@mdit/plugin-alert";
import { container } from "@mdit/plugin-container";
import { footnote } from "@mdit/plugin-footnote";
import { ins } from "@mdit/plugin-ins";
import { mark } from "@mdit/plugin-mark";
import { sub } from "@mdit/plugin-sub";
import { sup } from "@mdit/plugin-sup";
import { tasklist } from "@mdit/plugin-tasklist";
import { spoilerRule } from "@/features/room/chat/chatSpoilerRule";

export type ChatAlign = "left" | "center" | "right" | "justify";
export type ChatAlertKind = "note" | "tip" | "important" | "warning" | "caution";

export type ChatTag =
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "strong"
  | "em"
  | "s"
  | "u"
  | "mark"
  | "sup"
  | "sub"
  | "code"
  | "pre"
  | "a"
  | "span"
  | "blockquote"
  | "ul"
  | "ol"
  | "li"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td"
  | "hr"
  | "spoiler"
  | "details"
  | "aligned"
  | "alert"
  | "task"
  | "footnoteRef"
  | "footnotes"
  | "footnote";

export interface ChatText {
  kind: "text";
  text: string;
}
export interface ChatBreak {
  kind: "break";
}
export interface ChatElement {
  kind: "element";
  tag: ChatTag;
  children: ChatNode[];
  /** Only ever an http, https or mailto address. */
  href?: string;
  title?: string;
  start?: number;
  align?: ChatAlign;
  alert?: ChatAlertKind;
  checked?: boolean;
  /** The text after `:::details`, empty when the author gave none. */
  summary?: string;
  /** Footnote number, counted from 1. */
  number?: number;
}
export type ChatNode = ChatText | ChatBreak | ChatElement;

/** Past this many tokens a message is shown as plain text, so one message cannot stall the page. */
const MAX_TOKENS = 5000;

const ALIGNS: readonly string[] = ["left", "center", "right", "justify"];
const ALERTS: readonly string[] = ["note", "tip", "important", "warning", "caution"];
const SAFE_LINK = /^(?:https?:|mailto:)/i;

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.linkify.set({ fuzzyLink: false, fuzzyEmail: false, fuzzyIP: false });
md.use(ins).use(mark).use(sup).use(sub).use(footnote).use(tasklist, { label: false }).use(alert);
md.use(container, { name: "details" });
for (const name of ALIGNS) md.use(container, { name });
md.core.ruler.before("text_join", "chat_spoiler", spoilerRule);

const SIMPLE: Record<string, ChatTag> = {
  paragraph_open: "p",
  strong_open: "strong",
  em_open: "em",
  s_open: "s",
  ins_open: "u",
  mark_open: "mark",
  sup_open: "sup",
  sub_open: "sub",
  blockquote_open: "blockquote",
  bullet_list_open: "ul",
  list_item_open: "li",
  table_open: "table",
  thead_open: "thead",
  tbody_open: "tbody",
  tr_open: "tr",
  th_open: "th",
  td_open: "td",
  spoiler_open: "spoiler",
  footnote_block_open: "footnotes",
};

const text = (value: string): ChatText => ({ kind: "text", text: value });
const element = (tag: ChatTag, children: ChatNode[] = []): ChatElement => ({ kind: "element", tag, children });

/** Plain paragraph for text that is not parsed, line breaks kept. */
export function plainMessage(value: string): ChatNode[] {
  const children = value.split("\n").flatMap((line, index): ChatNode[] => (index === 0 ? [text(line)] : [{ kind: "break" }, text(line)]));
  return [element("p", children)];
}

const attr = (token: Token, name: string): string | undefined => {
  const value = token.attrGet(name);
  return value === null ? undefined : String(value);
};
const safeHref = (href: string | undefined): string | undefined => (href && SAFE_LINK.test(href) ? href : undefined);

function openElement(token: Token): ChatElement | undefined {
  const simple = SIMPLE[token.type];
  if (simple) {
    const el = element(simple);
    const align = /text-align:\s*(left|center|right)/.exec(attr(token, "style") ?? "")?.[1];
    if (align && (simple === "th" || simple === "td")) el.align = align as ChatAlign;
    return el;
  }
  switch (token.type) {
    case "heading_open":
      return element(token.tag as ChatTag);
    case "ordered_list_open": {
      const el = element("ol");
      const start = Number(attr(token, "start"));
      if (Number.isInteger(start) && start > 0) el.start = start;
      return el;
    }
    case "link_open": {
      const href = safeHref(attr(token, "href"));
      const el = element(href ? "a" : "span");
      if (href) {
        el.href = href;
        el.title = attr(token, "title");
      }
      return el;
    }
    case "alert_open": {
      const kind = /markdown-alert-(\w+)/.exec(attr(token, "class") ?? "")?.[1] ?? "";
      const el = element("alert");
      el.alert = (ALERTS.includes(kind) ? kind : "note") as ChatAlertKind;
      return el;
    }
    case "container_details_open": {
      const el = element("details");
      el.summary = token.info.trim().slice("details".length).trim();
      return el;
    }
    case "footnote_open": {
      const el = element("footnote");
      el.number = Number(token.meta?.id) + 1 || undefined;
      return el;
    }
    default: {
      const align = /^container_(\w+)_open$/.exec(token.type)?.[1];
      if (align && ALIGNS.includes(align)) {
        const el = element("aligned");
        el.align = align as ChatAlign;
        return el;
      }
      return undefined;
    }
  }
}

// Tokens this module does not know are skipped but their content stays, so unfamiliar syntax degrades to its text.
function convert(blockTokens: readonly Token[]): ChatNode[] {
  const root: ChatNode[] = [];
  const open: (ChatElement | null)[] = [];
  const add = (node: ChatNode) => {
    let parent: ChatElement | null = null;
    for (let i = open.length - 1; i >= 0 && !parent; i--) parent = open[i] ?? null;
    (parent ? parent.children : root).push(node);
  };
  walk(blockTokens);
  return root;

  // Inline tokens are walked with the same stack, so an inline checkbox can reach the list item around it.
  function walk(tokens: readonly Token[]): void {
    for (const token of tokens) visit(token);
  }

  function visit(token: Token): void {
    if (token.nesting === 1) {
      const el = openElement(token);
      if (el) add(el);
      open.push(el ?? null);
      return;
    }
    if (token.nesting === -1) {
      open.pop();
      return;
    }
    switch (token.type) {
      case "inline":
        walk(token.children ?? []);
        break;
      case "text":
        add(text(token.content));
        break;
      case "softbreak":
      case "hardbreak":
        add({ kind: "break" });
        break;
      case "code_inline":
        add(element("code", [text(token.content)]));
        break;
      case "fence":
      case "code_block":
        add(element("pre", [text(token.content.replace(/\n$/, ""))]));
        break;
      case "hr":
        add(element("hr"));
        break;
      case "image": {
        const label = token.content || attr(token, "src") || "";
        const href = safeHref(attr(token, "src"));
        add(href ? { ...element("a", [text(label)]), href } : text(label));
        break;
      }
      case "checkbox_input": {
        const el = element("task");
        el.checked = token.attrGet("checked") !== null;
        // The list item carries it too, so it can drop its bullet.
        for (let i = open.length - 1; i >= 0; i--) {
          if (open[i]?.tag === "li") {
            open[i]!.checked = el.checked;
            break;
          }
        }
        add(el);
        break;
      }
      case "footnote_ref": {
        const el = element("footnoteRef");
        el.number = Number(token.meta?.id) + 1;
        add(el);
        break;
      }
      default:
        break;
    }
  }
}

/** The message as a tree of known elements. Never throws, and never produces HTML: anything unsupported is plain text. */
export function parseChatMarkdown(value: string): ChatNode[] {
  try {
    const tokens = md.parse(value, {});
    const count = tokens.reduce((sum, token) => sum + 1 + (token.children?.length ?? 0), 0);
    if (count > MAX_TOKENS) return plainMessage(value);
    return convert(tokens);
  } catch {
    return plainMessage(value);
  }
}
