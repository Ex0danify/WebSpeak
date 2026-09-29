// The peer and signalling half of useScreenSharePeers (Step V5.2), on stub peers. The wire messages
// (`screenShareSignal`, `screenShareLeave`) and the Chinese error texts are pinned as they are today.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMediaStream, FakeMediaStreamTrack, FakeRTCPeerConnection, type BrowserStubs } from "./test-support/browser-stubs";
import { StatsPeer, displayStream, installPeerEnvironment, makeStream, setupPeers } from "./test-support/screen-share-peers";

let stubs: BrowserStubs;

const NEGOTIATION_TIMEOUT = "屏幕共享直连协商超时，请确认双方网络允许浏览器直连";
const DEFAULT_P2P_ERROR = "直连 P2P 失败，当前网络无法建立浏览器之间的直接连接";

beforeEach(() => {
  stubs = installPeerEnvironment();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  stubs.restore();
});

/** Registers a stream in the store, as `screenShareList`/`screenShareStarted` do. */
function register(context: ReturnType<typeof setupPeers>, overrides: Parameters<typeof makeStream>[0] = {}) {
  const stream = makeStream(overrides);
  context.store.screenShareStreams.push(stream);
  return stream;
}

function signals(context: ReturnType<typeof setupPeers>) {
  return context.sent.filter((message) => message.type === "screenShareSignal");
}

describe("startScreenShareViewer", () => {
  it("offers to a browser owner: viewer peer, recvonly video, the offer and the timer", async () => {
    const context = setupPeers();
    const addTransceiver = vi.spyOn(FakeRTCPeerConnection.prototype, "addTransceiver") as unknown as { mock: { calls: unknown[][] } };
    const stream = register(context);
    await context.module.startScreenShareViewer(stream);
    expect(context.peers).toHaveLength(1);
    expect(addTransceiver.mock.calls).toEqual([["video", { direction: "recvonly" }]]);
    expect(context.sent).toEqual([{ type: "screenShareSignal", streamId: "s1", targetPeerId: "owner-1", signal: { kind: "offer", sdp: "fake-offer" } }]);
    expect(context.store.screenShareViewing).toBe(true);
    expect(context.store.screenShareViewingStreamId).toBe("s1");
    expect(context.store.screenShareRemoteStream).toBeNull();
  });

  it("adds a recvonly audio transceiver when the stream carries audio", async () => {
    const context = setupPeers();
    const addTransceiver = vi.spyOn(FakeRTCPeerConnection.prototype, "addTransceiver") as unknown as { mock: { calls: unknown[][] } };
    await context.module.startScreenShareViewer(register(context, { audio: true }));
    expect(addTransceiver.mock.calls.map(([kind]) => kind)).toEqual(["video", "audio"]);
  });

  it("waits for the offer of a TeamSpeak stream and still arms the timer", async () => {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context, { source: "teamspeak" }));
    expect(context.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(context.store.screenShareError).toBe(NEGOTIATION_TIMEOUT);
  });

  it("replaces every earlier peer and clears the previous error", async () => {
    const context = setupPeers();
    context.store.screenShareError = "old";
    context.store.screenShareErrorCode = "OLD";
    await context.module.startScreenShareViewer(register(context, { streamId: "a", ownerPeerId: "pa" }));
    await context.module.startScreenShareViewer(register(context, { streamId: "b", ownerPeerId: "pb" }));
    expect(context.peers.map((peer) => peer.closed)).toEqual([true, false]);
    expect(context.store.screenShareError).toBe("");
    expect(context.store.screenShareErrorCode).toBe("");
    expect(context.store.screenShareViewingStreamId).toBe("b");
  });

  it("gives up after the negotiation timeout: leave message, viewing reset, error text, peer closed", async () => {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context));
    context.sent.length = 0;
    await vi.advanceTimersByTimeAsync(14_999);
    expect(context.store.screenShareViewing).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(context.sent).toEqual([{ type: "screenShareLeave", streamId: "s1" }]);
    expect(context.store.screenShareViewing).toBe(false);
    expect(context.store.screenShareViewingStreamId).toBe("");
    expect(context.store.screenShareRemoteStream).toBeNull();
    expect(context.store.screenShareError).toBe(NEGOTIATION_TIMEOUT);
    expect(context.store.screenShareErrorCode).toBe("");
    expect(context.peers[0].closed).toBe(true);
  });

  it("fails with its own text when the offer cannot be created", async () => {
    const context = setupPeers();
    vi.spyOn(FakeRTCPeerConnection.prototype, "createOffer").mockRejectedValue(new Error("no"));
    await context.module.startScreenShareViewer(register(context));
    expect(context.store.screenShareError).toBe("无法创建屏幕共享直连请求，请重试");
    expect(context.sent).toEqual([{ type: "screenShareLeave", streamId: "s1" }]);
    expect(context.store.screenShareViewing).toBe(false);
  });
});

describe("peer events", () => {
  async function viewer() {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context));
    context.sent.length = 0;
    return { context, peer: context.peers[0] };
  }

  it("sends every local ICE candidate to the target peer and ignores the end marker", async () => {
    const { context, peer } = await viewer();
    (peer.onicecandidate as (event: unknown) => void)({ candidate: null });
    expect(context.sent).toEqual([]);
    (peer.onicecandidate as (event: unknown) => void)({ candidate: { candidate: "cand", sdpMid: "0", sdpMLineIndex: 0 } });
    expect(context.sent).toEqual([{
      type: "screenShareSignal", streamId: "s1", targetPeerId: "owner-1",
      signal: { kind: "iceCandidate", candidate: "cand", sdpMid: "0", sdpMLineIndex: 0 },
    }]);
  });

  it("a remote track publishes the stream, marks viewing and stops the timer", async () => {
    const { context, peer } = await viewer();
    const remote = new FakeMediaStream();
    (peer.ontrack as (event: unknown) => void)({ streams: [remote], track: new FakeMediaStreamTrack("video") });
    expect(context.store.screenShareRemoteStream).toBe(remote);
    expect(context.store.screenShareViewing).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(context.store.screenShareError).toBe("");
  });

  it("a track without a stream is added to one stream per peer", async () => {
    const { context, peer } = await viewer();
    const video = new FakeMediaStreamTrack("video");
    const audio = new FakeMediaStreamTrack("audio");
    (peer.ontrack as (event: unknown) => void)({ streams: [], track: video });
    const first = context.store.screenShareRemoteStream as unknown as FakeMediaStream;
    (peer.ontrack as (event: unknown) => void)({ streams: [], track: audio });
    expect(context.store.screenShareRemoteStream).toBe(first);
    expect(first.getTracks()).toEqual([video, audio]);
  });

  it("an owner peer ignores incoming tracks", async () => {
    const context = setupPeers();
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    (context.peers[0].ontrack as (event: unknown) => void)({ streams: [new FakeMediaStream()], track: new FakeMediaStreamTrack("video") });
    expect(context.store.screenShareRemoteStream).toBeNull();
    expect(context.store.screenShareViewing).toBe(false);
  });

  it("`connected` stops the timer, `failed` fails the peer, `closed` closes it", async () => {
    const { context, peer } = await viewer();
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(context.store.screenShareError).toBe("");
    peer.connectionState = "failed";
    peer.onconnectionstatechange?.();
    expect(context.store.screenShareError).toBe(DEFAULT_P2P_ERROR);
    expect(context.sent).toEqual([{ type: "screenShareLeave", streamId: "s1" }]);
    expect(peer.closed).toBe(true);
  });

  it("`closed` on the current peer closes it, on a replaced peer it does nothing", async () => {
    const { context, peer } = await viewer();
    await context.module.startScreenShareViewer(register(context, { streamId: "s2", ownerPeerId: "owner-1" }));
    const replacement = context.peers[1];
    peer.connectionState = "closed";
    peer.onconnectionstatechange?.();
    expect(replacement.closed).toBe(false);
    replacement.connectionState = "closed";
    replacement.onconnectionstatechange?.();
    expect(context.store.screenShareStreams).toHaveLength(2);
  });
});

describe("owner peers", () => {
  async function ownerPeer(video: Record<string, unknown>, outputSettings?: Record<string, number>) {
    const local = displayStream(video);
    const senders: { track: MediaStreamTrack; setParameters: ReturnType<typeof vi.fn>; getParameters: () => Record<string, unknown> }[] = [];
    vi.spyOn(FakeRTCPeerConnection.prototype, "addTrack").mockImplementation(((track: MediaStreamTrack) => {
      const sender = { track, setParameters: vi.fn(async () => undefined), getParameters: () => ({ encodings: [{ rid: "r" }, { rid: "second" }] }) };
      senders.push(sender);
      return sender;
    }) as never);
    const context = setupPeers();
    await context.capture(local.stream, outputSettings as never);
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    await vi.advanceTimersByTimeAsync(0);
    return { context, senders, local };
  }

  it("adds every local track and only tunes the video sender", async () => {
    const { senders, local } = await ownerPeer({ width: 1920, height: 1080, frameRate: 60 });
    expect(senders.map((sender) => sender.track)).toEqual([local.videoTrack, local.audioTrack]);
    expect(senders[0].setParameters).toHaveBeenCalledTimes(1);
    expect(senders[1].setParameters).not.toHaveBeenCalled();
  });

  it("keeps the source size and rate when nothing is requested", async () => {
    const { senders } = await ownerPeer({ width: 1920, height: 1080, frameRate: 60 });
    expect(senders[0].setParameters.mock.calls[0][0]).toEqual({
      encodings: [{ rid: "r", maxFramerate: 60 }, { rid: "second" }], degradationPreference: "maintain-framerate",
    });
  });

  it("scales down to the requested limits and caps the rate at the source rate", async () => {
    const { senders } = await ownerPeer({ width: 3840, height: 2160, frameRate: 30 }, { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 60 });
    expect(senders[0].setParameters.mock.calls[0][0].encodings[0]).toEqual({ rid: "r", scaleResolutionDownBy: 2, maxFramerate: 30 });
  });

  it("never scales up, and lowers the rate to the requested maximum", async () => {
    const { senders } = await ownerPeer({ width: 1280, height: 720, frameRate: 60 }, { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 15 });
    expect(senders[0].setParameters.mock.calls[0][0].encodings[0]).toEqual({ rid: "r", maxFramerate: 15 });
  });

  it("survives a browser that rejects the sender parameters", async () => {
    vi.spyOn(FakeRTCPeerConnection.prototype, "addTrack").mockImplementation((() => ({ setParameters: async () => { throw new Error("no"); }, getParameters: () => ({}) })) as never);
    const context = setupPeers();
    await context.capture(displayStream().stream);
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    await vi.advanceTimersByTimeAsync(0);
    expect(context.store.screenShareError).toBe("");
  });
});

describe("codec preference", () => {
  it("puts VP8 first for the video transceiver", async () => {
    const setCodecPreferences = vi.fn();
    const codecs = [{ mimeType: "video/H264" }, { mimeType: "video/VP8" }, { mimeType: "video/VP9" }];
    vi.stubGlobal("RTCRtpReceiver", { getCapabilities: () => ({ codecs }) });
    vi.spyOn(StatsPeer.prototype, "getTransceivers").mockReturnValue([{ sender: { track: null }, receiver: { track: { kind: "video" } }, setCodecPreferences }]);
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context));
    expect(setCodecPreferences).toHaveBeenCalledWith([codecs[1], codecs[0], codecs[2]]);
    vi.unstubAllGlobals();
  });

  it("does nothing without VP8 in the capabilities, and swallows a rejecting browser", async () => {
    const setCodecPreferences = vi.fn(() => { throw new Error("no"); });
    vi.spyOn(StatsPeer.prototype, "getTransceivers").mockReturnValue([{ sender: { track: null }, receiver: { track: { kind: "video" } }, setCodecPreferences }]);
    vi.stubGlobal("RTCRtpReceiver", { getCapabilities: () => ({ codecs: [{ mimeType: "video/VP9" }] }) });
    const first = setupPeers();
    await first.module.startScreenShareViewer(register(first));
    expect(setCodecPreferences).not.toHaveBeenCalled();
    vi.stubGlobal("RTCRtpReceiver", { getCapabilities: () => ({ codecs: [{ mimeType: "video/VP8" }] }) });
    await first.module.startScreenShareViewer(register(first, { streamId: "s2" }));
    expect(setCodecPreferences).toHaveBeenCalledTimes(1);
    expect(first.store.screenShareViewing).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("startNativeScreenShareViewer", () => {
  it("only offers for the own, active, browser stream", async () => {
    const context = setupPeers();
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    register(context, { streamId: "mine", ownerPeerId: "me", source: "teamspeak" });
    context.store.screenShareActiveStreamId = "mine";
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    context.store.screenShareStreams.splice(0);
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "other";
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    expect(context.peers).toHaveLength(0);
    expect(context.sent).toEqual([]);
  });

  it("replaces an older peer of the same viewer and sends the offer to it", async () => {
    const context = setupPeers();
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    expect(context.peers.map((peer) => peer.closed)).toEqual([true, false]);
    expect(signals(context)).toEqual([
      { type: "screenShareSignal", streamId: "mine", targetPeerId: "ts-viewer-1", signal: { kind: "offer", sdp: "fake-offer" } },
      { type: "screenShareSignal", streamId: "mine", targetPeerId: "ts-viewer-1", signal: { kind: "offer", sdp: "fake-offer" } },
    ]);
  });

  it("fails only that viewer's peer when the offer cannot be created", async () => {
    const context = setupPeers();
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    vi.spyOn(FakeRTCPeerConnection.prototype, "createOffer").mockRejectedValue(new Error("no"));
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    expect(context.store.screenShareError).toBe("无法为 TeamSpeak 观看端创建屏幕共享直连");
    expect(context.peers[0].closed).toBe(true);
    expect(context.sent).toEqual([]);
  });
});

describe("handleScreenShareSignal", () => {
  it("ignores a signal for an unknown stream", async () => {
    const context = setupPeers();
    await context.module.handleScreenShareSignal("nope", "p", { kind: "offer", sdp: "x" });
    expect(context.peers).toHaveLength(0);
  });

  it("a close signal closes that peer and ends viewing only for the watched stream", async () => {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context));
    register(context, { streamId: "other", ownerPeerId: "po" });
    await context.module.handleScreenShareSignal("other", "po", { kind: "close" });
    expect(context.store.screenShareViewing).toBe(true);
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "close" });
    expect(context.peers[0].closed).toBe(true);
    expect(context.store.screenShareViewing).toBe(false);
    expect(context.store.screenShareViewingStreamId).toBe("");
  });

  it("queues ICE candidates until the remote description is set, then applies them in order", async () => {
    const context = setupPeers();
    const addIceCandidate = vi.spyOn(FakeRTCPeerConnection.prototype, "addIceCandidate");
    await context.module.startScreenShareViewer(register(context));
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "iceCandidate", candidate: "c1", sdpMid: "0", sdpMLineIndex: 0 });
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "iceCandidate", candidate: "c2" });
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "iceCandidate", candidate: "" });
    expect(addIceCandidate).not.toHaveBeenCalled();
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "answer", sdp: "answer" });
    expect(context.peers[0].remoteDescription).toEqual({ type: "answer", sdp: "answer" });
    expect(addIceCandidate.mock.calls).toEqual([[{ candidate: "c1", sdpMid: "0", sdpMLineIndex: 0 }], [{ candidate: "c2" }]]);
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "iceCandidate", candidate: "c3" });
    expect(addIceCandidate).toHaveBeenCalledTimes(3);
  });

  it("a stale ICE candidate that the peer rejects is not fatal", async () => {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context));
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "answer", sdp: "answer" });
    vi.spyOn(FakeRTCPeerConnection.prototype, "addIceCandidate").mockRejectedValue(new Error("stale"));
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "iceCandidate", candidate: "c" });
    expect(context.store.screenShareError).toBe("");
  });

  it("answers the offer of a TeamSpeak stream that is being watched", async () => {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context, { source: "teamspeak" }));
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "offer" });
    expect(context.sent).toEqual([]);
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "offer", sdp: "ts-offer" });
    expect(context.peers[0].remoteDescription).toEqual({ type: "offer", sdp: "ts-offer" });
    expect(context.sent).toEqual([{ type: "screenShareSignal", streamId: "s1", targetPeerId: "owner-1", signal: { kind: "answer", sdp: "fake-answer" } }]);
  });

  it("fails the peer when a TeamSpeak offer cannot be answered", async () => {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context, { source: "teamspeak" }));
    vi.spyOn(FakeRTCPeerConnection.prototype, "setRemoteDescription").mockRejectedValue(new Error("bad"));
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "offer", sdp: "ts-offer" });
    expect(context.store.screenShareError).toBe("无法回复 TeamSpeak 屏幕共享的直连请求");
    expect(context.store.screenShareViewing).toBe(false);
  });

  it("applies a browser owner's answer to the viewer peer, or fails with its text", async () => {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context));
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "answer" });
    expect(context.peers[0].remoteDescription).toBeNull();
    await context.module.handleScreenShareSignal("s1", "unknown-peer", { kind: "answer", sdp: "a" });
    expect(context.peers[0].remoteDescription).toBeNull();
    vi.spyOn(FakeRTCPeerConnection.prototype, "setRemoteDescription").mockRejectedValue(new Error("bad"));
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "answer", sdp: "a" });
    expect(context.store.screenShareError).toBe("观看端无法完成屏幕共享直连协商");
  });

  it("applies a TeamSpeak viewer's answer to the own share's peer, or fails with its text", async () => {
    const context = setupPeers();
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    await context.module.startNativeScreenShareViewer("mine", "ts-viewer-1");
    await context.module.handleScreenShareSignal("mine", "ts-viewer-1", { kind: "answer", sdp: "a" });
    expect(context.peers[0].remoteDescription).toEqual({ type: "answer", sdp: "a" });
    vi.spyOn(FakeRTCPeerConnection.prototype, "setRemoteDescription").mockRejectedValue(new Error("bad"));
    await context.module.handleScreenShareSignal("mine", "ts-viewer-1", { kind: "answer", sdp: "b" });
    expect(context.store.screenShareError).toBe("TeamSpeak 观看端无法完成屏幕共享直连协商");
    expect(context.peers[0].closed).toBe(true);
  });

  it("answers a viewer's offer for the own share, creating an owner peer", async () => {
    const context = setupPeers();
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    await context.module.handleScreenShareSignal("mine", "viewer-1", { kind: "offer", sdp: "viewer-offer" });
    expect(context.peers[0].remoteDescription).toEqual({ type: "offer", sdp: "viewer-offer" });
    expect(context.sent).toEqual([{ type: "screenShareSignal", streamId: "mine", targetPeerId: "viewer-1", signal: { kind: "answer", sdp: "fake-answer" } }]);
    expect(context.store.screenShareViewing).toBe(false);
  });

  it("a non-offer signal from an unknown viewer of the own share still creates the peer but does nothing else", async () => {
    const context = setupPeers();
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    await context.module.handleScreenShareSignal("mine", "viewer-1", { kind: "answer", sdp: "x" });
    expect(context.peers).toHaveLength(1);
    expect(context.sent).toEqual([]);
  });

  it("a failed answer to a viewer is reported without closing the peer", async () => {
    const context = setupPeers();
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    vi.spyOn(FakeRTCPeerConnection.prototype, "setRemoteDescription").mockRejectedValue(new Error("bad"));
    await context.module.handleScreenShareSignal("mine", "viewer-1", { kind: "offer", sdp: "viewer-offer" });
    expect(context.store.screenShareError).toBe("共享端无法完成观看者的直连协商");
    expect(context.peers[0].closed).toBe(false);
  });

  it("a signal that matches no route is dropped", async () => {
    const context = setupPeers();
    register(context, { streamId: "s1", ownerPeerId: "someone" });
    await context.module.handleScreenShareSignal("s1", "x", { kind: "offer", sdp: "o" });
    expect(context.peers).toHaveLength(0);
    expect(context.sent).toEqual([]);
  });
});

describe("closing", () => {
  it("closeAllScreenSharePeers closes every peer and stops the stats poll", async () => {
    const context = setupPeers();
    register(context, { streamId: "mine", ownerPeerId: "me" });
    context.store.screenShareActiveStreamId = "mine";
    await context.module.handleScreenShareSignal("mine", "v1", { kind: "offer", sdp: "o" });
    await context.module.handleScreenShareSignal("mine", "v2", { kind: "offer", sdp: "o" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(context.stats.peers).toHaveLength(2);
    context.module.closeAllScreenSharePeers();
    expect(context.peers.map((peer) => peer.closed)).toEqual([true, true]);
    expect(context.stats).toMatchObject({ updatedAt: null, peers: [] });
  });

  it("closing a peer twice, or a peer that is not there, is harmless, and its timer is cancelled", async () => {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context));
    context.module.closeScreenSharePeer("owner-1");
    context.module.closeScreenSharePeer("owner-1");
    context.module.closeScreenSharePeer("nobody");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(context.store.screenShareError).toBe("");
  });

  it("candidates queued for a peer are dropped with it, not applied to a new peer with the same id", async () => {
    const context = setupPeers();
    const addIceCandidate = vi.spyOn(FakeRTCPeerConnection.prototype, "addIceCandidate");
    await context.module.startScreenShareViewer(register(context));
    await context.module.handleScreenShareSignal("s1", "owner-1", { kind: "iceCandidate", candidate: "stale" });
    context.module.closeScreenSharePeer("owner-1");
    await context.module.startScreenShareViewer(register(context, { streamId: "s2" }));
    await context.module.handleScreenShareSignal("s2", "owner-1", { kind: "answer", sdp: "a" });
    expect(addIceCandidate).not.toHaveBeenCalled();
  });

  it("a peer that throws on close is still forgotten", async () => {
    const context = setupPeers();
    await context.module.startScreenShareViewer(register(context));
    vi.spyOn(context.peers[0], "close").mockImplementation(() => { throw new Error("already closed"); });
    expect(() => context.module.closeScreenSharePeer("owner-1")).not.toThrow();
    await context.module.startScreenShareViewer(register(context, { streamId: "s2" }));
    expect(context.peers).toHaveLength(2);
  });
});
