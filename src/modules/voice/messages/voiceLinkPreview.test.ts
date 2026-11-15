import { describe, expect, it } from "vitest";
import { LinkPreviewBudget, LinkPreviewError, type LinkPreview, type LinkPreviewService } from "../../linkPreview/index.js";
import type { WebClientEntry } from "../voiceTypes.js";
import type { ClientCommand } from "./voiceProtocol.js";
import { handleLinkPreview } from "./voiceLinkPreview.js";

const command = (payload: Record<string, unknown> = { url: "https://example.com/a" }): ClientCommand => ({
  type: "getLinkPreview",
  requestId: "r1",
  payload,
});

function setup(service: (url: string, full: boolean) => Promise<LinkPreview>) {
  const frames: Array<Record<string, unknown>> = [];
  const entry = { linkPreviewBudget: new LinkPreviewBudget(0) } as unknown as WebClientEntry;
  const fake = { preview: service } as unknown as LinkPreviewService;
  const run = (cmd = command()) => handleLinkPreview(entry, cmd, (frame) => frames.push(frame), fake);
  return { frames, run, entry };
}

const page: LinkPreview = { kind: "page", url: "https://example.com/a", siteName: "Example", title: "T", description: "D" };

describe("handleLinkPreview", () => {
  it("answers with the preview and the request id", async () => {
    const { frames, run } = setup(async () => page);
    await run();
    expect(frames).toEqual([{ type: "linkPreview", requestId: "r1", url: "https://example.com/a", preview: page }]);
  });

  it("passes the click on an image as `full`", async () => {
    const seen: boolean[] = [];
    const { run } = setup(async (_url, full) => {
      seen.push(full);
      return page;
    });
    await run(command({ url: "https://example.com/a", full: true }));
    await run(command({ url: "https://example.com/a" }));
    expect(seen).toEqual([true, false]);
  });

  it.each([
    ["invalid", "LINK_PREVIEW_INVALID"],
    ["blocked", "LINK_PREVIEW_BLOCKED"],
    ["failed", "LINK_PREVIEW_FAILED"],
    ["too-large", "LINK_PREVIEW_TOO_LARGE"],
    ["unsupported", "LINK_PREVIEW_UNSUPPORTED"],
  ] as const)("answers a %s failure with its code and no text", async (reason, code) => {
    const { frames, run } = setup(async () => {
      throw new LinkPreviewError(reason, "internal detail");
    });
    await run();
    expect(frames).toEqual([{ type: "linkPreviewError", requestId: "r1", url: "https://example.com/a", code }]);
  });

  it("answers an unexpected error with the failed code", async () => {
    const { frames, run } = setup(async () => {
      throw new Error("boom");
    });
    await run();
    expect(frames[0]).toMatchObject({ type: "linkPreviewError", code: "LINK_PREVIEW_FAILED" });
    expect(JSON.stringify(frames)).not.toContain("boom");
  });

  it("answers failed when the gateway has no preview service", async () => {
    const frames: Array<Record<string, unknown>> = [];
    const entry = { linkPreviewBudget: new LinkPreviewBudget(0) } as unknown as WebClientEntry;
    await handleLinkPreview(entry, command(), (frame) => frames.push(frame), undefined);
    expect(frames[0]).toMatchObject({ type: "linkPreviewError", code: "LINK_PREVIEW_FAILED" });
  });

  it("limits the requests of one session", async () => {
    let calls = 0;
    const { frames, run, entry } = setup(async () => {
      calls++;
      return page;
    });
    // A bucket made at time 0 is full for the first eight requests, whatever the clock says now.
    entry.linkPreviewBudget = new LinkPreviewBudget(Date.now());
    for (let index = 0; index < 10; index++) await run();
    expect(calls).toBe(8);
    expect(frames.filter((frame) => frame.code === "LINK_PREVIEW_RATE_LIMITED")).toHaveLength(2);
  });

  it("limits the image bytes of one session", async () => {
    const big: LinkPreview = {
      kind: "image",
      url: "https://example.com/a.png",
      image: { mime: "image/png", bytes: 1, dataUri: "x".repeat(9 * 1024 * 1024) },
    };
    const { frames, run } = setup(async () => big);
    await run();
    await run();
    expect(frames.map((frame) => frame.type)).toEqual(["linkPreview", "linkPreviewError"]);
    expect(frames[1]).toMatchObject({ code: "LINK_PREVIEW_RATE_LIMITED" });
  });
});
