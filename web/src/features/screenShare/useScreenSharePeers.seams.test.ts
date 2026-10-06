// The router seams, stream list helpers and message sender of useScreenSharePeers (split from the session test).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMediaStream, FakeMediaStreamTrack, type BrowserStubs } from "@/testSupport/browserStubs";
import { installPeerEnvironment, setupPeers } from "@/testSupport/screenSharePeers";

let stubs: BrowserStubs;

beforeEach(() => { stubs = installPeerEnvironment(); });
afterEach(() => {
  vi.restoreAllMocks();
  stubs.restore();
});

/** A display track: `ended` listeners are kept so a test can end the share as the browser does. */
class DisplayTrack extends FakeMediaStreamTrack {
  contentHint = "";
  surface: string | undefined;
  private readonly endedListeners: (() => void)[] = [];
  readonly listenerOptions: unknown[] = [];
  override getSettings(): Record<string, unknown> { return this.surface ? { displaySurface: this.surface } : {}; }
  override addEventListener(type?: string, listener?: () => void, options?: unknown): void {
    if (type !== "ended" || !listener) return;
    this.endedListeners.push(listener);
    this.listenerOptions.push(options);
  }
  end(): void { for (const listener of this.endedListeners.splice(0)) listener(); }
}

function display(options: { video?: boolean; audio?: boolean; surface?: string } = {}) {
  const video = options.video === false ? null : new DisplayTrack("video");
  if (video) video.surface = options.surface;
  const audio = options.audio ? new DisplayTrack("audio") : null;
  const tracks = [video, audio].filter((track): track is DisplayTrack => track !== null);
  return { stream: new FakeMediaStream(tracks) as unknown as MediaStream, video, audio, tracks };
}

function picker(result: () => Promise<MediaStream>) {
  const getDisplayMedia = vi.fn(result);
  (navigator.mediaDevices as unknown as { getDisplayMedia: unknown }).getDisplayMedia = getDisplayMedia;
  return getDisplayMedia;
}

function deferredPicker() {
  let resolve: (stream: MediaStream) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const getDisplayMedia = picker(() => new Promise<MediaStream>((ok, fail) => { resolve = ok; reject = fail; }));
  return { getDisplayMedia, resolve: (stream: MediaStream) => resolve(stream), reject: (error: unknown) => reject(error) };
}

describe("router seams", () => {
  it("consumePendingStart is true only for the request that is pending and not cancelled, and always clears it", async () => {
    const context = setupPeers();
    expect(context.module.consumePendingStart("")).toBe(false);
    picker(async () => display().stream);
    await context.module.startScreenShare();
    expect(context.module.consumePendingStart("other")).toBe(false);
    expect(context.module.consumePendingStart("screen-start-1")).toBe(false);
    context.module.stopScreenShare();
    await context.module.startScreenShare();
    expect(context.module.consumePendingStart("screen-start-2")).toBe(true);
    context.module.stopScreenShare();
  });

  it("consumePendingStart is false for a cancelled start", async () => {
    const context = setupPeers();
    picker(async () => display().stream);
    await context.module.startScreenShare();
    context.module.stopScreenShare();
    expect(context.module.consumePendingStart("screen-start-1")).toBe(false);
  });

  it("clearPendingStart forgets the request and the cancellation", async () => {
    const context = setupPeers();
    const pending = deferredPicker();
    const started = context.module.startScreenShare();
    context.module.stopScreenShare();
    context.module.clearPendingStart();
    pending.resolve(display().stream);
    await started;
    expect(context.module.consumePendingStart("screen-start-1")).toBe(false);
  });

  it("releaseCapture stops the display tracks, once, and is harmless without one", async () => {
    const context = setupPeers();
    context.module.releaseCapture();
    const shot = display({ audio: true });
    picker(async () => shot.stream);
    await context.module.startScreenShare();
    context.module.releaseCapture();
    expect(shot.tracks.every((track) => track.stopped)).toBe(true);
    context.module.releaseCapture();
  });
});

describe("stream list helpers", () => {
  it("upsertScreenShareStream fills defaults and keeps the position of a replaced stream", () => {
    const context = setupPeers();
    vi.spyOn(Date, "now").mockReturnValue(7_000);
    const first = context.module.upsertScreenShareStream({ streamId: "a", ownerPeerId: "p" });
    expect(first).toEqual({
      streamId: "a", source: "browser", ownerPeerId: "p", ownerNickname: "TeamSpeak 用户", name: "屏幕共享", audio: false,
      createdAt: 7_000, viewerCount: 0, viewers: [],
    });
    context.module.upsertScreenShareStream({ streamId: "b", ownerPeerId: "q", source: "teamspeak", ownerClientId: 4, audio: true });
    context.module.upsertScreenShareStream({ streamId: "a", ownerPeerId: "p", name: "renamed", viewerCount: 3 });
    expect(context.store.screenShareStreams.map((stream) => [stream.streamId, stream.name])).toEqual([["a", "renamed"], ["b", "屏幕共享"]]);
    expect(context.store.screenShareStreams[1]).toMatchObject({ source: "teamspeak", ownerClientId: 4, audio: true });
  });

  it("upsertScreenShareStream rejects anything without a string stream id and owner", () => {
    const context = setupPeers();
    for (const raw of [null, undefined, "x", 5, {}, { streamId: "a" }, { ownerPeerId: "p" }, { streamId: 1, ownerPeerId: "p" }]) {
      expect(context.module.upsertScreenShareStream(raw)).toBeNull();
    }
    expect(context.store.screenShareStreams).toHaveLength(0);
  });

  it("upsertScreenShareStream ignores fields of the wrong type", () => {
    const context = setupPeers();
    vi.spyOn(Date, "now").mockReturnValue(9);
    expect(context.module.upsertScreenShareStream({
      streamId: "a", ownerPeerId: "p", ownerClientId: "4", ownerNickname: 1, name: 2, audio: "yes", createdAt: "x", viewerCount: "3", viewers: "no",
    })).toEqual({
      streamId: "a", source: "browser", ownerPeerId: "p", ownerNickname: "TeamSpeak 用户", name: "屏幕共享", audio: false,
      createdAt: 9, viewerCount: 0, viewers: [],
    });
  });

  it("normalizeScreenShareViewers keeps well-formed viewers, at most 64, with clipped text and light avatars", () => {
    const context = setupPeers();
    expect(context.module.normalizeScreenShareViewers("no")).toEqual([]);
    const many = Array.from({ length: 70 }, (_, index) => ({ peerId: `p${index}`, nickname: "n" }));
    expect(context.module.normalizeScreenShareViewers(many)).toHaveLength(64);
    const [viewer, small, big] = context.module.normalizeScreenShareViewers([
      { peerId: "p".repeat(200), nickname: "n".repeat(200) },
      { peerId: "a", nickname: "b", avatar: "x".repeat(128 * 1024) },
      { peerId: "c", nickname: "d", avatar: "x".repeat(128 * 1024 + 1) },
      { peerId: 1, nickname: "e" }, { peerId: "f" }, null, "g",
    ]);
    expect(viewer).toEqual({ peerId: "p".repeat(128), nickname: "n".repeat(120) });
    expect(small.avatar).toHaveLength(128 * 1024);
    expect(big).toEqual({ peerId: "c", nickname: "d" });
  });
});

describe("sendScreenShareMessage", () => {
  it("sends JSON only on an open socket", () => {
    const context = setupPeers();
    context.module.sendScreenShareMessage({ type: "screenShareList" });
    (context.socket as { readyState: number }).readyState = 2;
    context.module.sendScreenShareMessage({ type: "screenShareList" });
    expect(context.sent).toEqual([{ type: "screenShareList" }]);
  });
});
