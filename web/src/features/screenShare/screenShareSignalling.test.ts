// The signalling of useScreenSharePeers (screenShareSignalling.ts) on stub peers: viewer and native-viewer
// offers and incoming signals. Wire messages and Chinese error texts are pinned as they are today.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRTCPeerConnection, type BrowserStubs } from "@/testSupport/browserStubs";
import { installPeerEnvironment, makeStream, setupPeers } from "@/testSupport/screenSharePeers";

let stubs: BrowserStubs;

const NEGOTIATION_TIMEOUT = { key: "screenShareP2PTimeout" };

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
    expect(context.store.screenShareError).toEqual(NEGOTIATION_TIMEOUT);
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
    expect(context.store.screenShareError).toEqual(NEGOTIATION_TIMEOUT);
    expect(context.store.screenShareErrorCode).toBe("");
    expect(context.peers[0].closed).toBe(true);
  });

  it("fails with its own text when the offer cannot be created", async () => {
    const context = setupPeers();
    vi.spyOn(FakeRTCPeerConnection.prototype, "createOffer").mockRejectedValue(new Error("no"));
    await context.module.startScreenShareViewer(register(context));
    expect(context.store.screenShareError).toEqual({ key: "screenShareP2POfferFailed" });
    expect(context.sent).toEqual([{ type: "screenShareLeave", streamId: "s1" }]);
    expect(context.store.screenShareViewing).toBe(false);
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
    expect(context.store.screenShareError).toEqual({ key: "screenShareP2PTsViewerFailed" });
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
    expect(context.store.screenShareError).toEqual({ key: "screenShareP2PTsAnswerFailed" });
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
    expect(context.store.screenShareError).toEqual({ key: "screenShareP2PViewerNegotiationFailed" });
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
    expect(context.store.screenShareError).toEqual({ key: "screenShareP2PTsNegotiationFailed" });
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
    expect(context.store.screenShareError).toEqual({ key: "screenShareP2POwnerNegotiationFailed" });
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
