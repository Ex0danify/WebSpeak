import { describe, expect, it } from "vitest";
import { cleanText, readPageMeta } from "./htmlMeta.js";

const page = (head: string, body = "<p>hi</p>") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("readPageMeta", () => {
  it("reads open graph tags", () => {
    const meta = readPageMeta(
      page(`
        <meta property="og:site_name" content="GitHub">
        <meta property="og:title" content="Ex0danify/WebSpeak">
        <meta property="og:description" content="A self-hosted web client">
        <meta property="og:image" content="https://opengraph.example/a.png">
        <title>ignored</title>`),
    );
    expect(meta).toEqual({
      siteName: "GitHub",
      title: "Ex0danify/WebSpeak",
      description: "A self-hosted web client",
      image: "https://opengraph.example/a.png",
    });
  });

  it("falls back to twitter tags, the description meta and the title element", () => {
    expect(readPageMeta(page('<meta name="twitter:title" content="T"><meta name="description" content="D">'))).toMatchObject({
      title: "T",
      description: "D",
    });
    expect(readPageMeta(page("<title>Only a title</title>")).title).toBe("Only a title");
  });

  it("prefers the first tag of a kind and accepts single quotes and bare values", () => {
    const meta = readPageMeta(page("<meta property='og:title' content='first'><meta property=og:title content=second>"));
    expect(meta.title).toBe("first");
    expect(readPageMeta(page("<meta property=og:title content=bare>")).title).toBe("bare");
  });

  it("decodes entities and removes markup characters from display text", () => {
    const meta = readPageMeta(page('<meta property="og:title" content="Tom &amp; Jerry &#x1F600; &lt;b&gt;bold&lt;/b&gt;">'));
    expect(meta.title).toBe("Tom & Jerry \u{1F600} <b>bold</b>");
  });

  it("never reads content from script, style or comments", () => {
    const meta = readPageMeta(
      page(`
        <!-- <meta property="og:title" content="from a comment"> -->
        <script>var a = '<meta property="og:title" content="from a script">';</script>
        <style>/* <meta property="og:title" content="from a style"> */</style>
        <meta property="og:title" content="real">`),
    );
    expect(meta.title).toBe("real");
  });

  it("stops at the body", () => {
    expect(readPageMeta(page("<title>head</title>", '<meta property="og:title" content="body">')).title).toBe("head");
  });

  it("cuts and cleans long and odd text", () => {
    const meta = readPageMeta(
      page(
        `<meta property="og:title" content="${"x".repeat(500)}"><meta property="og:description" content="a${String.fromCharCode(0)}b${String.fromCharCode(0x202e)}c\n\n  d">`,
      ),
    );
    expect(meta.title).toHaveLength(200);
    expect(meta.description).toBe("a b c d");
  });

  it("survives broken and hostile input", () => {
    expect(() => readPageMeta("<" + "meta ".repeat(50_000))).not.toThrow();
    expect(() => readPageMeta("<meta " + 'a="'.repeat(100_000))).not.toThrow();
    expect(() => readPageMeta("<script>" + "x".repeat(10_000))).not.toThrow();
    expect(readPageMeta("")).toEqual({ title: "", description: "", siteName: "", image: "" });
  });

  it("stays fast on a page of nothing but opening brackets, with or without a closing one", () => {
    for (const html of ["<".repeat(262_144), `${"<".repeat(262_144)}>`, `${"<a ".repeat(90_000)}`, `${"<!-".repeat(90_000)}`]) {
      const started = Date.now();
      readPageMeta(html);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });

  it("still finds the tags after a stray bracket", () => {
    expect(readPageMeta(page('<<<<meta property="og:title" content="found">')).title).toBe("found");
  });

  it("is linear on a page with very many tags", () => {
    const started = Date.now();
    readPageMeta(page("<meta property='a' content='b'>".repeat(5000) + "<script>x</script>".repeat(5000)));
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("cleanText", () => {
  it("replaces an invalid numeric entity", () => {
    expect(cleanText("a&#0;b&#xD800;c", 50)).toBe("a b c");
  });

  it("leaves an unknown named entity as it is", () => {
    expect(cleanText("a &unknown; b", 50)).toBe("a &unknown; b");
  });
});
