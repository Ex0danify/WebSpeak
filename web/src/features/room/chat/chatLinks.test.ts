import { describe, expect, it } from "vitest";
import { parseChatMarkdown } from "@/features/room/chat/chatMarkdown";
import { MAX_PREVIEWS_PER_MESSAGE, previewLinks } from "@/features/room/chat/chatLinks";

const links = (text: string) => previewLinks(parseChatMarkdown(text));

describe("previewLinks", () => {
  it("finds a bare address and a markdown link", () => {
    expect(links("look https://example.com/a.png")).toEqual(["https://example.com/a.png"]);
    expect(links("[docs](https://example.com/docs)")).toEqual(["https://example.com/docs"]);
  });

  it("lists each address once and stops at the limit", () => {
    expect(links("https://a.example https://a.example")).toEqual(["https://a.example"]);
    const many = Array.from({ length: 5 }, (_, index) => `https://site${index}.example`).join(" ");
    expect(links(many)).toHaveLength(MAX_PREVIEWS_PER_MESSAGE);
  });

  it("ignores mailto links, code and plain text", () => {
    expect(links("[mail](mailto:a@b.example)")).toEqual([]);
    expect(links("`https://example.com`")).toEqual([]);
    expect(links("```\nhttps://example.com\n```")).toEqual([]);
    expect(links("no links here, not even example.com")).toEqual([]);
  });

  it("finds links inside formatting and quotes", () => {
    expect(links("> **see https://example.com/q**")).toEqual(["https://example.com/q"]);
  });
});
