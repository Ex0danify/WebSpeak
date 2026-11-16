export interface PageMeta {
  title: string;
  description: string;
  siteName: string;
  /** The raw value of the page's image tag, still to be resolved against the page address. */
  image: string;
}

const MAX_TAG_LENGTH = 4096;
const LIMITS = { title: 200, description: 300, siteName: 80 } as const;

// Control characters, zero-width and direction marks, line separators and the byte order mark. Written as a string so the
// source holds no invisible characters.
// eslint-disable-next-line no-control-regex
const HIDDEN_CHARACTERS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]", "g");

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,6}));/g, (whole, decimal, hex, name) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    const code = decimal ? Number(decimal) : Number.parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : " ";
  });
}

/** Plain text for display: entities decoded, control characters and layout whitespace gone, cut to length. */
export function cleanText(text: string, max: number): string {
  return decodeEntities(text).replace(HIDDEN_CHARACTERS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** The attributes of one tag. A single pass over a tag that is at most MAX_TAG_LENGTH long. */
function readAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /[\s/]/.test(source[index]!)) index++;
    const nameStart = index;
    while (index < source.length && !/[\s=/>]/.test(source[index]!)) index++;
    const name = source.slice(nameStart, index).toLowerCase();
    while (index < source.length && /\s/.test(source[index]!)) index++;
    let value = "";
    if (source[index] === "=") {
      index++;
      while (index < source.length && /\s/.test(source[index]!)) index++;
      const quote = source[index];
      if (quote === '"' || quote === "'") {
        const end = source.indexOf(quote, index + 1);
        value = source.slice(index + 1, end < 0 ? source.length : end);
        index = end < 0 ? source.length : end + 1;
      } else {
        const valueStart = index;
        while (index < source.length && !/\s/.test(source[index]!)) index++;
        value = source.slice(valueStart, index);
      }
    }
    if (name && !attributes.has(name)) attributes.set(name, value);
  }
  return attributes;
}

/**
 * Title, description, site name and image of a page, read from its head. This is a text scan: the page is never
 * turned into a document, nothing in it is evaluated, and script and style content is skipped unread.
 */
export function readPageMeta(html: string): PageMeta {
  const meta = new Map<string, string>();
  // ASCII only, so the indexes stay the same as in `html`.
  const lower = html.replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32));
  let documentTitle = "";
  let index = 0;
  let nextClose = -1;
  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open < 0) break;
    if (html.startsWith("<!--", open)) {
      const end = html.indexOf("-->", open + 4);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    // The next ">" is searched once and reused for every "<" before it, so a page of nothing but "<" stays linear.
    if (nextClose <= open) nextClose = html.indexOf(">", open + 1);
    if (nextClose < 0) break;
    const close = nextClose;
    if (close - open > MAX_TAG_LENGTH) {
      index = open + 1;
      continue;
    }
    // A "<" inside what looks like a tag means the first one was text, the tag starts at the last one.
    const inner = html.lastIndexOf("<", close - 1);
    if (inner > open) {
      index = inner;
      continue;
    }
    const tag = html.slice(open + 1, close);
    const name = /^[a-zA-Z0-9]+/.exec(tag)?.[0]?.toLowerCase() ?? "";
    index = close + 1;
    if (name === "script" || name === "style") {
      const end = lower.indexOf(`</${name}`, index);
      index = end < 0 ? html.length : end;
    } else if (name === "body") {
      break;
    } else if (name === "title" && !documentTitle) {
      const end = html.indexOf("<", index);
      documentTitle = html.slice(index, end < 0 ? html.length : Math.min(end, index + 1000));
    } else if (name === "meta") {
      const attributes = readAttributes(tag.slice(4));
      const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
      const content = attributes.get("content");
      if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
    }
  }
  const first = (...keys: string[]) => keys.map((key) => meta.get(key)).find((value) => value !== undefined && value.trim() !== "") ?? "";
  return {
    title: cleanText(first("og:title", "twitter:title") || documentTitle, LIMITS.title),
    description: cleanText(first("og:description", "twitter:description", "description"), LIMITS.description),
    siteName: cleanText(first("og:site_name"), LIMITS.siteName),
    image: decodeEntities(first("og:image", "og:image:url", "twitter:image")).trim(),
  };
}
