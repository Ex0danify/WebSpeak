// The session half of useScreenSharePeers (Step V5.3): starting and stopping the own share, joining and
// leaving another one, the stream list helpers and the three seams the router still uses. The
// messages the router sends and receives are also pinned by messages.screenshare.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMediaStream, FakeMediaStreamTrack, type BrowserStubs } from "./test-support/browser-stubs";
import { installPeerEnvironment, makeStream, setupPeers } from "./test-support/screen-share-peers";

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

describe("startScreenShare", () => {
  it("asks the browser for the display at its native size, then announces the share", async () => {
    const context = setupPeers();
    const shot = display({ audio: true });
    const getDisplayMedia = picker(async () => shot.stream);
    await context.module.startScreenShare(false);
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: true, audio: false, systemAudio: "include", windowAudio: "window", selfBrowserSurface: "exclude",
    });
    expect(context.sent).toEqual([{ type: "screenShareStart", requestId: "screen-start-1", audio: true, name: "我的屏幕" }]);
    expect(context.store.screenShareStarting).toBe(true);
    expect(context.store.screenShareActive).toBe(false);
  });

  it("announces a share without audio tracks as silent", async () => {
    const context = setupPeers();
    picker(async () => display().stream);
    await context.module.startScreenShare();
    expect(context.sent).toEqual([{ type: "screenShareStart", requestId: "screen-start-1", audio: false, name: "我的屏幕" }]);
  });

  it("hints detail for a browser tab and motion for anything else", async () => {
    const context = setupPeers();
    const tab = display({ surface: "browser" });
    picker(async () => tab.stream);
    await context.module.startScreenShare();
    expect(tab.video?.contentHint).toBe("detail");
    context.module.stopScreenShare();
    const monitor = display({ surface: "monitor" });
    picker(async () => monitor.stream);
    await context.module.startScreenShare();
    expect(monitor.video?.contentHint).toBe("motion");
  });

  it("does nothing while the socket is not open, or while a share is starting or active", async () => {
    const context = setupPeers();
    const getDisplayMedia = picker(async () => display().stream);
    (context.socket as { readyState: number }).readyState = 0;
    await context.module.startScreenShare();
    (context.socket as { readyState: number }).readyState = 1;
    context.store.screenShareStarting = true;
    await context.module.startScreenShare();
    context.store.screenShareStarting = false;
    context.store.screenShareActive = true;
    await context.module.startScreenShare();
    expect(getDisplayMedia).not.toHaveBeenCalled();
    expect(context.sent).toEqual([]);
  });

  it("reports a browser without screen capture and clears the earlier error first", async () => {
    const context = setupPeers();
    (navigator.mediaDevices as unknown as { getDisplayMedia: unknown }).getDisplayMedia = undefined;
    context.store.screenShareErrorCode = "OLD";
    await context.module.startScreenShare();
    expect(context.store.screenShareError).toBe("当前浏览器不支持屏幕共享");
    expect(context.store.screenShareStarting).toBe(false);
  });

  it.fails("VD4: the unsupported-browser message does not keep a stale error code next to it", async () => {
    const context = setupPeers();
    (navigator.mediaDevices as unknown as { getDisplayMedia: unknown }).getDisplayMedia = undefined;
    context.store.screenShareErrorCode = "OLD";
    await context.module.startScreenShare();
    expect(context.store.screenShareErrorCode).toBe("");
  });

  it("clears the previous error and code once the picker is really opened", async () => {
    const context = setupPeers();
    context.store.screenShareError = "old";
    context.store.screenShareErrorCode = "OLD";
    const pending = deferredPicker();
    const started = context.module.startScreenShare();
    expect(context.store.screenShareError).toBe("");
    expect(context.store.screenShareErrorCode).toBe("");
    pending.resolve(display().stream);
    await started;
  });

  it("a refused permission and any other failure end the start with their own text", async () => {
    const context = setupPeers();
    picker(async () => { throw new DOMException("no", "NotAllowedError"); });
    await context.module.startScreenShare();
    expect(context.store.screenShareError).toBe("你取消了屏幕共享或浏览器未授予权限");
    expect(context.store.screenShareStarting).toBe(false);
    picker(async () => { throw new Error("boom"); });
    await context.module.startScreenShare();
    expect(context.store.screenShareError).toBe("无法开始屏幕共享，请检查浏览器权限");
    expect(context.sent).toEqual([]);
  });

  it("a capture without a video track is reported as a failure", async () => {
    const context = setupPeers();
    const shot = display({ video: false, audio: true });
    picker(async () => shot.stream);
    await context.module.startScreenShare();
    expect(context.store.screenShareError).toBe("无法开始屏幕共享，请检查浏览器权限");
    expect(context.store.screenShareStarting).toBe(false);
    expect(context.sent).toEqual([]);
  });

  it.fails("VD3: a capture without a video track is stopped, so its audio does not keep capturing", async () => {
    const context = setupPeers();
    const shot = display({ video: false, audio: true });
    picker(async () => shot.stream);
    await context.module.startScreenShare();
    expect(shot.tracks.every((track) => track.stopped)).toBe(true);
  });

  it("stopping while the picker is open stops the capture that arrives late and sends nothing", async () => {
    const context = setupPeers();
    const pending = deferredPicker();
    const started = context.module.startScreenShare();
    expect(context.store.screenShareStarting).toBe(true);
    context.module.stopScreenShare();
    const shot = display({ audio: true });
    pending.resolve(shot.stream);
    await started;
    expect(shot.tracks.every((track) => track.stopped)).toBe(true);
    expect(context.sent).toEqual([]);
    expect(context.store.screenShareStarting).toBe(false);
  });

  it("a picker failure after the start was cancelled leaves the newer state alone", async () => {
    const context = setupPeers();
    const pending = deferredPicker();
    const started = context.module.startScreenShare();
    context.module.stopScreenShare();
    pending.reject(new DOMException("no", "NotAllowedError"));
    await started;
    expect(context.store.screenShareError).toBe("");
  });

  it("a track that ends on its own stops the share", async () => {
    const context = setupPeers();
    const shot = display({ audio: true });
    picker(async () => shot.stream);
    await context.module.startScreenShare();
    context.sent.length = 0;
    context.store.screenShareActive = true;
    context.store.screenShareActiveStreamId = "mine";
    shot.video?.end();
    expect(context.sent).toEqual([{ type: "screenShareStop", streamId: "mine" }]);
    expect(shot.tracks.every((track) => track.stopped)).toBe(true);
    expect(context.store.screenShareActive).toBe(false);
    shot.audio?.end();
    expect(context.sent).toHaveLength(1);
    expect((shot.video as DisplayTrack).listenerOptions).toEqual([{ once: true }]);
  });
});

describe("ownership checks", () => {
  it("VD5: the own share is whichever stream is active, so the owner check never rejects it", async () => {
    const context = setupPeers();
    context.store.screenShareStreams.push(makeStream({ streamId: "mine", ownerPeerId: "someone-else" }));
    context.store.screenShareActiveStreamId = "mine";
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    expect(context.peers).toHaveLength(1);
  });
});

describe("stopScreenShare", () => {
  it("tells the gateway only for an active share, and resets every flag", async () => {
    const context = setupPeers();
    const shot = display();
    picker(async () => shot.stream);
    await context.module.startScreenShare();
    context.sent.length = 0;
    context.module.stopScreenShare();
    expect(context.sent).toEqual([]);
    expect(shot.video?.stopped).toBe(true);
    expect(context.store.screenShareStarting).toBe(false);
    context.store.screenShareActive = true;
    context.store.screenShareActiveStreamId = "mine";
    context.module.stopScreenShare();
    expect(context.sent).toEqual([{ type: "screenShareStop", streamId: "mine" }]);
    expect(context.store.screenShareActive).toBe(false);
    expect(context.store.screenShareActiveStreamId).toBe("");
  });

  it("closes the peers of the own share", async () => {
    const context = setupPeers();
    context.store.screenShareStreams.push(makeStream({ streamId: "mine", ownerPeerId: "me" }));
    context.store.screenShareActiveStreamId = "mine";
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    context.module.stopScreenShare();
    expect(context.peers[0].closed).toBe(true);
  });

  it("keeps the stream list, the viewing state and the remote stream", () => {
    const context = setupPeers();
    context.store.screenShareStreams.push(makeStream());
    context.store.screenShareViewing = true;
    context.store.screenShareViewingStreamId = "s1";
    context.module.stopScreenShare();
    expect(context.store.screenShareStreams).toHaveLength(1);
    expect(context.store.screenShareViewing).toBe(true);
  });
});

describe("joinScreenShare / leaveScreenShare", () => {
  it("clears the error and asks to join with a fresh request id", () => {
    const context = setupPeers();
    context.store.screenShareError = "old";
    context.store.screenShareErrorCode = "OLD";
    context.module.joinScreenShare("a");
    context.module.joinScreenShare("b");
    expect(context.store.screenShareError).toBe("");
    expect(context.store.screenShareErrorCode).toBe("");
    expect(context.sent).toEqual([
      { type: "screenShareJoin", streamId: "a", requestId: "screen-join-1" },
      { type: "screenShareJoin", streamId: "b", requestId: "screen-join-2" },
    ]);
  });

  it("joining another stream leaves the watched one first, joining the same one does not", () => {
    const context = setupPeers();
    context.store.screenShareViewing = true;
    context.store.screenShareViewingStreamId = "a";
    context.module.joinScreenShare("a");
    expect(context.sent.map((message) => message.type)).toEqual(["screenShareJoin"]);
    context.sent.length = 0;
    context.module.joinScreenShare("b");
    expect(context.sent).toEqual([
      { type: "screenShareLeave", streamId: "a" },
      { type: "screenShareJoin", streamId: "b", requestId: "screen-join-2" },
    ]);
    expect(context.store.screenShareViewing).toBe(false);
  });

  it("the request counter is shared between start and join", async () => {
    const context = setupPeers();
    picker(async () => display().stream);
    await context.module.startScreenShare();
    context.module.joinScreenShare("a");
    expect(context.sent.map((message) => message.requestId)).toEqual(["screen-start-1", "screen-join-2"]);
  });

  it("leaving tells the gateway, closes every peer and forgets the remote stream", async () => {
    const context = setupPeers();
    context.store.screenShareStreams.push(makeStream({ source: "teamspeak" }));
    await context.module.startScreenShareViewer(context.store.screenShareStreams[0]);
    context.store.screenShareRemoteStream = new FakeMediaStream() as unknown as MediaStream;
    context.module.leaveScreenShare();
    expect(context.sent).toEqual([{ type: "screenShareLeave", streamId: "s1" }]);
    expect(context.peers[0].closed).toBe(true);
    expect(context.store.screenShareViewing).toBe(false);
    expect(context.store.screenShareViewingStreamId).toBe("");
    expect(context.store.screenShareRemoteStream).toBeNull();
  });

  it("leaving without a watched stream sends nothing", () => {
    const context = setupPeers();
    context.module.leaveScreenShare();
    expect(context.sent).toEqual([]);
  });
});

describe("stopScreenShareTransport", () => {
  async function activeShare() {
    const context = setupPeers();
    const shot = display();
    picker(async () => shot.stream);
    await context.module.startScreenShare();
    context.sent.length = 0;
    context.store.screenShareStreams.push(makeStream({ streamId: "mine", ownerPeerId: "me" }), makeStream({ streamId: "other" }));
    context.store.screenShareActive = true;
    context.store.screenShareActiveStreamId = "mine";
    context.store.screenShareViewing = true;
    context.store.screenShareViewingStreamId = "other";
    context.store.screenShareRemoteStream = new FakeMediaStream() as unknown as MediaStream;
    return { context, shot };
  }

  it("resets the whole share, viewing and stream list, and sends the stop when asked to", async () => {
    const { context, shot } = await activeShare();
    context.module.stopScreenShareTransport(true);
    expect(context.sent).toEqual([{ type: "screenShareStop", streamId: "mine" }]);
    expect(shot.video?.stopped).toBe(true);
    expect(context.store.screenShareActive).toBe(false);
    expect(context.store.screenShareActiveStreamId).toBe("");
    expect(context.store.screenShareViewing).toBe(false);
    expect(context.store.screenShareViewingStreamId).toBe("");
    expect(context.store.screenShareRemoteStream).toBeNull();
    expect(context.store.screenShareStreams).toHaveLength(0);
  });

  it("does not tell the gateway when the connection is gone (`false`) or the share is not active", async () => {
    const { context } = await activeShare();
    context.module.stopScreenShareTransport(false);
    expect(context.sent).toEqual([]);
    context.store.screenShareActiveStreamId = "mine";
    context.module.stopScreenShareTransport(true);
    expect(context.sent).toEqual([]);
  });

  it("cancels a start whose picker is still open", async () => {
    const context = setupPeers();
    const pending = deferredPicker();
    const started = context.module.startScreenShare();
    context.module.stopScreenShareTransport(false);
    const shot = display();
    pending.resolve(shot.stream);
    await started;
    expect(shot.video?.stopped).toBe(true);
    expect(context.sent).toEqual([]);
  });
});

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
