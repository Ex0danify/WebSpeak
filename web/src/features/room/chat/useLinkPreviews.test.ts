import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLinkPreviews } from "@/features/room/chat/useLinkPreviews";
import type { LinkPreviewData } from "@/features/session";

const page = (url: string): LinkPreviewData => ({ kind: "page", url, siteName: "S", title: "T", description: "" });
const failure = (code: string) => Object.assign(new Error(code), { code });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("createLinkPreviews", () => {
  it("asks once per address and keeps the answer", async () => {
    const request = vi.fn(async (url: string) => page(url));
    const previews = createLinkPreviews(request);
    previews.ensure("https://a.example");
    previews.ensure("https://a.example");
    expect(previews.stateOf("https://a.example")).toEqual({ status: "loading" });
    await settle();
    expect(previews.stateOf("https://a.example")).toMatchObject({ status: "ready" });
    previews.ensure("https://a.example");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("runs two requests at a time", async () => {
    const releases: Array<() => void> = [];
    const request = vi.fn((url: string) => new Promise<LinkPreviewData>((resolve) => releases.push(() => resolve(page(url)))));
    const previews = createLinkPreviews(request);
    for (const name of ["a", "b", "c"]) previews.ensure(`https://${name}.example`);
    expect(request).toHaveBeenCalledTimes(2);
    releases[0]!();
    await settle();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("keeps the code of a failure for the card to explain", async () => {
    const previews = createLinkPreviews(async () => {
      throw failure("LINK_PREVIEW_BLOCKED");
    });
    previews.ensure("https://a.example");
    await settle();
    expect(previews.stateOf("https://a.example")).toEqual({ status: "error", code: "LINK_PREVIEW_BLOCKED" });
  });

  it("falls back to the failed code for an error without one", async () => {
    const previews = createLinkPreviews(async () => {
      throw new Error("x");
    });
    previews.ensure("https://a.example");
    await settle();
    expect(previews.stateOf("https://a.example")).toEqual({ status: "error", code: "LINK_PREVIEW_FAILED" });
  });

  it("tries again after the gateway's rate limit, up to twice", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<(url: string) => Promise<LinkPreviewData>>()
      .mockRejectedValueOnce(failure("LINK_PREVIEW_RATE_LIMITED"))
      .mockRejectedValueOnce(failure("LINK_PREVIEW_RATE_LIMITED"))
      .mockResolvedValueOnce(page("https://a.example"));
    const previews = createLinkPreviews(request);
    previews.ensure("https://a.example");
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(3);
    expect(previews.stateOf("https://a.example")).toMatchObject({ status: "ready" });
  });

  it("gives up on a third rate limit", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => {
      throw failure("LINK_PREVIEW_RATE_LIMITED");
    });
    const previews = createLinkPreviews(request);
    previews.ensure("https://a.example");
    await vi.advanceTimersByTimeAsync(7000);
    expect(request).toHaveBeenCalledTimes(3);
    expect(previews.stateOf("https://a.example")).toEqual({ status: "error", code: "LINK_PREVIEW_RATE_LIMITED" });
  });

  it("asks for the full image when told to", async () => {
    const request = vi.fn(async (url: string) => page(url));
    const previews = createLinkPreviews(request);
    previews.loadFull("https://a.example/big.png");
    await settle();
    expect(request).toHaveBeenCalledWith("https://a.example/big.png", true);
  });

  it("sends nothing while previews are off, and remembers the choice", () => {
    const request = vi.fn(async (url: string) => page(url));
    const previews = createLinkPreviews(request);
    previews.setEnabled(false);
    previews.ensure("https://a.example");
    expect(previews.stateOf("https://a.example")).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(createLinkPreviews(request).enabled.value).toBe(false);
    previews.setEnabled(true);
    expect(createLinkPreviews(request).enabled.value).toBe(true);
  });
});
