import { describe, expect, it } from "vitest";
import { parseChatMarkdown, plainMessage, type ChatNode } from "@/features/room/chat/chatMarkdown";

// One line per message: elements as <tag>…</tag>, a line break as ⏎.
function show(nodes: ChatNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return node.text;
      if (node.kind === "break") return "⏎";
      const attrs = [
        node.href && `href=${node.href}`,
        node.align && `align=${node.align}`,
        node.alert && `alert=${node.alert}`,
        node.start && `start=${node.start}`,
        node.checked !== undefined && `checked=${node.checked}`,
        node.summary !== undefined && `summary=${node.summary}`,
        node.number && `n=${node.number}`,
      ].filter(Boolean);
      const open = `<${node.tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
      return node.tag === "hr" || node.tag === "task" || node.tag === "footnoteRef" ? open : `${open}${show(node.children)}</${node.tag}>`;
    })
    .join("");
}
const render = (source: string) => show(parseChatMarkdown(source));

describe("inline formatting", () => {
  it.each([
    ["plain text", "hello", "<p>hello</p>"],
    ["bold", "**b**", "<p><strong>b</strong></p>"],
    ["italic", "*i*", "<p><em>i</em></p>"],
    ["strike", "~~s~~", "<p><s>s</s></p>"],
    ["underline", "++u++", "<p><u>u</u></p>"],
    ["highlight", "==m==", "<p><mark>m</mark></p>"],
    ["superscript", "2^10^", "<p>2<sup>10</sup></p>"],
    ["subscript", "H~2~O", "<p>H<sub>2</sub>O</p>"],
    ["inline code", "`a *b*`", "<p><code>a *b*</code></p>"],
    ["nesting", "**bold *both***", "<p><strong>bold <em>both</em></strong></p>"],
    ["escaped marker", String.raw`\*not italic\*`, "<p>*not italic*</p>"],
    ["HTML entity", "Tom &amp; Jerry", "<p>Tom & Jerry</p>"],
  ])("%s", (_name, source, expected) => {
    expect(render(source)).toBe(expected);
  });
});

describe("spoiler", () => {
  it.each([
    ["simple", "The answer is ||42||.", "<p>The answer is <spoiler>42</spoiler>.</p>"],
    ["formatted inside", "||**x**||", "<p><spoiler><strong>x</strong></spoiler></p>"],
    ["two in a row", "||a|| and ||b||", "<p><spoiler>a</spoiler> and <spoiler>b</spoiler></p>"],
    ["unclosed", "a ||b", "<p>a ||b</p>"],
    ["empty", "a |||| b", "<p>a |||| b</p>"],
    ["escaped", String.raw`\|\|x\|\|`, "<p>||x||</p>"],
    ["inside code", "`||x||`", "<p><code>||x||</code></p>"],
    ["does not cross a link", "||a [b||c](https://x.io)", "<p>||a <a href=https://x.io>b||c</a></p>"],
  ])("%s", (_name, source, expected) => {
    expect(render(source)).toBe(expected);
  });
});

describe("links", () => {
  it.each([
    ["markdown link", "[docs](https://example.com)", "<p><a href=https://example.com>docs</a></p>"],
    ["mail link", "[me](mailto:a@b.io)", "<p><a href=mailto:a@b.io>me</a></p>"],
    ["autolink", "<https://example.com>", "<p><a href=https://example.com>https://example.com</a></p>"],
    ["plain url", "see https://example.com now", "<p>see <a href=https://example.com>https://example.com</a> now</p>"],
    ["bare domain stays text", "open file.js now", "<p>open file.js now</p>"],
    ["reference link", "[r][n]\n\n[n]: https://example.com", "<p><a href=https://example.com>r</a></p>"],
    ["image becomes a link", "![logo](https://example.com/a.png)", "<p><a href=https://example.com/a.png>logo</a></p>"],
  ])("%s", (_name, source, expected) => {
    expect(render(source)).toBe(expected);
  });
});

describe("blocks", () => {
  it.each([
    ["heading", "# One\n### Three", "<h1>One</h1><h3>Three</h3>"],
    ["setext heading", "Title\n---", "<h2>Title</h2>"],
    ["quote", "> quoted", "<blockquote><p>quoted</p></blockquote>"],
    ["unordered list", "- a\n- b", "<ul><li><p>a</p></li><li><p>b</p></li></ul>"],
    ["ordered list from 3", "3. a\n4. b", "<ol start=3><li><p>a</p></li><li><p>b</p></li></ol>"],
    ["thematic break", "a\n\n---\n\nb", "<p>a</p><hr><p>b</p>"],
    ["fenced code", "```js\nconst x = 1;\n```", "<pre>const x = 1;</pre>"],
    ["code keeps markup literal", "```\n**x** ||y||\n```", "<pre>**x** ||y||</pre>"],
    ["indented code", "    a\n    b", "<pre>a\nb</pre>"],
    [
      "table",
      "| A | B |\n|:--|--:|\n| 1 | 2 |",
      "<table><thead><tr><th align=left>A</th><th align=right>B</th></tr></thead><tbody><tr><td align=left>1</td><td align=right>2</td></tr></tbody></table>",
    ],
  ])("%s", (_name, source, expected) => {
    expect(render(source)).toBe(expected);
  });

  it("keeps a single newline as a line break and a blank line as a new paragraph", () => {
    expect(render("a\nb\n\nc")).toBe("<p>a⏎b</p><p>c</p>");
  });

  it("marks task items open or done", () => {
    expect(render("- [x] done\n- [ ] open")).toBe(
      "<ul><li checked=true><p><task checked=true> done</p></li><li checked=false><p><task checked=false> open</p></li></ul>",
    );
  });
});

describe("containers", () => {
  it.each(["left", "center", "right", "justify"])("aligns %s", (align) => {
    expect(render(`:::${align}\ntext\n:::`)).toBe(`<aligned align=${align}><p>text</p></aligned>`);
  });

  it("reads the summary of a details block", () => {
    expect(render(":::details More info\nhidden\n:::")).toBe("<details summary=More info><p>hidden</p></details>");
  });

  it("allows a details block without a summary", () => {
    expect(render(":::details\nhidden\n:::")).toBe("<details summary=><p>hidden</p></details>");
  });

  it.each(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])("shows a %s callout", (kind) => {
    expect(render(`> [!${kind}]\n> hi`)).toBe(`<alert alert=${kind.toLowerCase()}><p>hi</p></alert>`);
  });

  it("does not treat an unknown container as one", () => {
    expect(render(":::weird\ntext\n:::")).not.toContain("aligned");
  });
});

describe("footnotes", () => {
  it("numbers references and collects the definitions", () => {
    expect(render("claim[^a] and more[^b]\n\n[^a]: first\n[^b]: second")).toBe(
      "<p>claim<footnoteRef n=1> and more<footnoteRef n=2></p><footnotes><footnote n=1><p>first</p></footnote><footnote n=2><p>second</p></footnote></footnotes>",
    );
  });
});

describe("unsafe and malformed input", () => {
  it.each([
    ["script tag", "<script>alert(1)</script>"],
    ["inline html", "a <b onclick=x>b</b>"],
    ["html block", "<div><img src=x onerror=alert(1)></div>"],
    ["iframe", "<iframe src=//evil></iframe>"],
  ])("never emits raw html from a %s", (_name, source) => {
    // The serializer only prints known tags, so any raw tag in the output would be literal text.
    const nodes = parseChatMarkdown(source);
    const tags = JSON.stringify(nodes).match(/"tag":"(\w+)"/g) ?? [];
    expect(tags.every((tag) => /"(p|a|span|hr|pre|code|strong)"/.test(tag))).toBe(true);
    expect(render(source)).toContain(source.slice(0, 4));
  });

  it.each([
    ["javascript link", "[x](javascript:alert(1))"],
    ["uppercase javascript link", "[x](JaVaScRiPt:alert(1))"],
    ["data link", "[x](data:text/html;base64,PHNjcmlwdD4=)"],
    ["vbscript link", "[x](vbscript:msgbox)"],
    ["file link", "[x](file:///etc/passwd)"],
    ["relative link", "[x](/admin)"],
    ["protocol-relative link", "[x](//evil.example)"],
  ])("renders a %s as text, not a link", (_name, source) => {
    const out = parseChatMarkdown(source);
    expect(show(out)).not.toContain("href=");
    expect(show(out)).toContain("x");
  });

  it("does not turn a javascript image into a link", () => {
    expect(render("![x](javascript:alert(1))")).not.toContain("href=");
  });

  it("falls back to plain text above the token limit", () => {
    const out = parseChatMarkdown("*a* ".repeat(6000));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "element", tag: "p" });
    expect(show(out)).not.toContain("<em>");
  });

  it("handles deeply nested quotes without throwing", () => {
    expect(() => parseChatMarkdown(`${"> ".repeat(500)}deep`)).not.toThrow();
  });

  it("handles empty and whitespace-only text", () => {
    expect(render("")).toBe("");
    expect(() => parseChatMarkdown("   \n\n  ")).not.toThrow();
  });

  it("handles a 20000 character message", () => {
    expect(() => parseChatMarkdown(`**${"a".repeat(20_000)}**`)).not.toThrow();
  });
});

describe("plainMessage", () => {
  it("keeps line breaks and leaves markup alone", () => {
    expect(show(plainMessage("**a**\nb"))).toBe("<p>**a**⏎b</p>");
  });
});
