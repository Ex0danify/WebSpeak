import { describe, expect, it } from "vitest";
import { escapeCommandValue, unescapeCommandValue } from "./commandEscape.js";

describe("escapeCommandValue / unescapeCommandValue", () => {
  it.each([
    ["\\", "\\\\"],
    ["/", "\\/"],
    [" ", "\\s"],
    ["|", "\\p"],
    ["\x07", "\\a"],
    ["\b", "\\b"],
    ["\f", "\\f"],
    ["\n", "\\n"],
    ["\r", "\\r"],
    ["\t", "\\t"],
    ["\v", "\\v"],
  ])("escapes %j as %s and back", (plain, escaped) => {
    expect(escapeCommandValue(plain)).toBe(escaped);
    expect(unescapeCommandValue(escaped)).toBe(plain);
    expect(unescapeCommandValue(escapeCommandValue(`a${plain}b${plain}`))).toBe(`a${plain}b${plain}`);
  });

  it("escapes in one pass, so an escaped backslash is never escaped again", () => {
    expect(escapeCommandValue("\\ ")).toBe("\\\\\\s");
    expect(unescapeCommandValue("\\\\s")).toBe("\\s");
    expect(unescapeCommandValue("\\\\\\s")).toBe("\\ ");
  });

  it("leaves characters outside the table alone", () => {
    expect(escapeCommandValue("a=b,c;d:e\"f'g")).toBe("a=b,c;d:e\"f'g");
  });

  it("keeps CJK, emoji and other UTF-8 unchanged", () => {
    const [cjk, kana, emoji] = [
      String.fromCodePoint(0x4f60, 0x597d),
      String.fromCodePoint(0x30c6, 0x30b9, 0x30c8),
      String.fromCodePoint(0x1f600),
    ];
    const text = `${cjk} ${kana} ${emoji}|\u2049\ufe0f caf\u00e9`;
    expect(escapeCommandValue(text)).toBe(`${cjk}\\s${kana}\\s${emoji}\\p\u2049\ufe0f\\scaf\u00e9`);
    expect(unescapeCommandValue(escapeCommandValue(text))).toBe(text);
  });

  it("matches the phase 0 capture: space and pipe as \\s\\p, emoji raw", () => {
    expect(escapeCommandValue("a |😀")).toBe("a\\s\\p😀");
  });

  it("keeps unknown sequences and a trailing backslash as they are", () => {
    expect(unescapeCommandValue("a\\xb")).toBe("a\\xb");
    expect(unescapeCommandValue("a\\")).toBe("a\\");
    expect(unescapeCommandValue("\\\n")).toBe("\\\n");
  });

  it("round trips every character from 0 to 0x7f", () => {
    const all = Array.from({ length: 0x80 }, (_, code) => String.fromCharCode(code)).join("");
    const escaped = escapeCommandValue(all);
    expect(escaped).not.toMatch(/[ |\n\r\t]/);
    expect(unescapeCommandValue(escaped)).toBe(all);
  });
});
