const ESCAPES: Readonly<Record<string, string>> = {
  "\\": "\\\\",
  "/": "\\/",
  " ": "\\s",
  "|": "\\p",
  "\x07": "\\a",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\v": "\\v",
};

const UNESCAPES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ESCAPES).map(([plain, escaped]) => [escaped[1], plain]),
);

// eslint-disable-next-line no-control-regex -- \a (bell) is part of the escape table
const ESCAPE_PATTERN = /[\\/ |\x07\b\f\n\r\t\v]/g;
const UNESCAPE_PATTERN = /\\(.)/gs;

export function escapeCommandValue(value: string): string {
  return value.replace(ESCAPE_PATTERN, (char) => ESCAPES[char]);
}

/** Unknown sequences such as `\x` stay as they are, the server never sends them. */
export function unescapeCommandValue(value: string): string {
  return value.replace(UNESCAPE_PATTERN, (sequence, char: string) => UNESCAPES[char] ?? sequence);
}
