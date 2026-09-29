// Characterization of the screenShare* gateway messages (Step V0.3b, part 2).
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createVoiceHarness, type VoiceHarness } from "./test-support/harness";
import { FakeRTCPeerConnection } from "./test-support/browser-stubs";
import type { FakeWebSocket } from "./test-support/fake-websocket";

let harness: VoiceHarness;

async function connected(): Promise<FakeWebSocket> {
  harness = await createVoiceHarness();
  return harness.joinAndConnect();
}

async function push(socket: FakeWebSocket, message: Record<string, unknown>): Promise<void> {
  socket.receive(message);
  await flushPromises();
}

const stream = (overrides: Record<string, unknown> = {}) => ({ streamId: "s1", ownerPeerId: "peer-owner", ownerNickname: "Ana", name: "Ana's screen", audio: true, createdAt: 10, viewerCount: 0, viewers: [], ...overrides });

afterEach(() => harness?.dispose());

describe("screenShareList", () => {
  it("replaces the stream list, normalizing fields and skipping invalid entries", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareList", streams: [stream(), { streamId: "bad" }, null, { streamId: "s2", ownerPeerId: "ts-1", source: "teamspeak", ownerClientId: 4 }] });
    expect(harness.voice.screenShareStreams.map((s) => s.streamId)).toEqual(["s1", "s2"]);
    expect(harness.voice.screenShareStreams[0]).toMatchObject({ source: "browser", ownerNickname: "Ana", name: "Ana's screen", audio: true, createdAt: 10, viewerCount: 0, viewers: [] });
    expect(harness.voice.screenShareStreams[1]).toMatchObject({ source: "teamspeak", ownerClientId: 4, ownerNickname: "TeamSpeak 用户", name: "屏幕共享", audio: false, viewerCount: 0 });
    await push(socket, { type: "screenShareList" });
    expect(harness.voice.screenShareStreams).toHaveLength(0);
  });

  it("keeps only well-formed viewers, at most 64, with clipped text", async () => {
    const socket = await connected();
    const viewers = [...Array.from({ length: 70 }, (_, i) => ({ peerId: `p${i}`, nickname: "N".repeat(200) })), { peerId: 5 }];
    await push(socket, { type: "screenShareList", streams: [stream({ viewers })] });
    const kept = harness.voice.screenShareStreams[0].viewers;
    expect(kept).toHaveLength(64);
    expect(kept[0].nickname).toHaveLength(120);
  });
});

describe("screenShareStarted", () => {
  it("adds a stream started by someone else and replaces one with the same id", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareStarted", stream: stream() });
    await push(socket, { type: "screenShareStarted", stream: stream({ name: "renamed" }) });
    expect(harness.voice.screenShareStreams).toHaveLength(1);
    expect(harness.voice.screenShareStreams[0].name).toBe("renamed");
    expect(harness.voice.screenShareActive.value).toBe(false);
  });

  it("ignores a payload without a valid stream", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareStarted", stream: { streamId: 1 } });
    expect(harness.voice.screenShareStreams).toHaveLength(0);
  });

  it("marks the own share active when the owner reply matches the pending start request", async () => {
    const socket = await connected();
    await harness.voice.startScreenShare();
    expect(harness.voice.screenShareStarting.value).toBe(true);
    const [{ requestId }] = socket.sentOfType("screenShareStart") as [{ requestId: string }];
    await push(socket, { type: "screenShareStarted", owner: true, requestId, stream: stream({ streamId: "mine" }) });
    expect(harness.voice.screenShareStarting.value).toBe(false);
    expect(harness.voice.screenShareActive.value).toBe(true);
    expect(harness.voice.screenShareActiveStreamId.value).toBe("mine");
  });

  it("stops and removes an owner reply that no longer matches a pending start", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareStarted", owner: true, requestId: "stale", stream: stream({ streamId: "mine" }) });
    expect(socket.sentOfType("screenShareStop")).toEqual([{ type: "screenShareStop", streamId: "mine" }]);
    expect(harness.voice.screenShareStreams).toHaveLength(0);
    expect(harness.voice.screenShareActive.value).toBe(false);
  });
});

describe("screenShareViewerCount", () => {
  it("floors and clamps the count and refreshes the viewers, ignoring unknown streams", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareList", streams: [stream()] });
    await push(socket, { type: "screenShareViewerCount", streamId: "s1", viewerCount: 2.9, viewers: [{ peerId: "v1", nickname: "Ben" }] });
    expect(harness.voice.screenShareStreams[0]).toMatchObject({ viewerCount: 2, viewers: [{ peerId: "v1", nickname: "Ben" }] });
    await push(socket, { type: "screenShareViewerCount", streamId: "s1", viewerCount: -4 });
    expect(harness.voice.screenShareStreams[0].viewerCount).toBe(0);
    await push(socket, { type: "screenShareViewerCount", streamId: "nope", viewerCount: 9 });
    expect(harness.voice.screenShareStreams).toHaveLength(1);
  });
});

describe("screenShareStopped", () => {
  it("removes the stream", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareList", streams: [stream(), stream({ streamId: "s2" })] });
    await push(socket, { type: "screenShareStopped", streamId: "s1" });
    expect(harness.voice.screenShareStreams.map((s) => s.streamId)).toEqual(["s2"]);
  });

  it("ends the own share when it is the stopped stream", async () => {
    const socket = await connected();
    await harness.voice.startScreenShare();
    const [{ requestId }] = socket.sentOfType("screenShareStart") as [{ requestId: string }];
    await push(socket, { type: "screenShareStarted", owner: true, requestId, stream: stream({ streamId: "mine" }) });
    await push(socket, { type: "screenShareStopped", streamId: "mine" });
    expect(harness.voice.screenShareActive.value).toBe(false);
    expect(harness.voice.screenShareActiveStreamId.value).toBe("");
  });

  it("ends the viewing session when the watched stream is stopped", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareJoined", stream: stream() });
    expect(harness.voice.screenShareViewingStreamId.value).toBe("s1");
    await push(socket, { type: "screenShareStopped", streamId: "s1" });
    expect(harness.voice.screenShareViewing.value).toBe(false);
    expect(harness.voice.screenShareViewingStreamId.value).toBe("");
    expect(harness.voice.screenShareRemoteStream.value).toBeNull();
    expect(FakeRTCPeerConnection.instances[0].closed).toBe(true);
  });
});

describe("screenShareJoined", () => {
  it("starts viewing a browser stream by offering to its owner", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareJoined", stream: stream() });
    expect(harness.voice.screenShareViewing.value).toBe(true);
    expect(harness.voice.screenShareViewingStreamId.value).toBe("s1");
    expect(FakeRTCPeerConnection.instances).toHaveLength(1);
    expect(socket.sentOfType("screenShareSignal")).toMatchObject([{ streamId: "s1", targetPeerId: "peer-owner", signal: { kind: "offer", sdp: "fake-offer" } }]);
  });

  it("waits for the offer of a TeamSpeak stream instead of sending one", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareJoined", stream: stream({ streamId: "ts", ownerPeerId: "ts-owner", source: "teamspeak" }) });
    expect(harness.voice.screenShareViewingStreamId.value).toBe("ts");
    expect(socket.sentOfType("screenShareSignal")).toHaveLength(0);
  });

  it("ignores a payload without a valid stream", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareJoined" });
    expect(harness.voice.screenShareViewing.value).toBe(false);
  });
});

describe("screenShareSignal", () => {
  it("applies a browser owner's answer to the viewer peer", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareJoined", stream: stream() });
    await push(socket, { type: "screenShareSignal", streamId: "s1", fromPeerId: "peer-owner", signal: { kind: "answer", sdp: "remote-answer" } });
    expect(FakeRTCPeerConnection.instances[0].remoteDescription).toEqual({ type: "answer", sdp: "remote-answer" });
  });

  it("ignores signals for unknown streams and messages missing fields", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareJoined", stream: stream() });
    await push(socket, { type: "screenShareSignal", streamId: "nope", fromPeerId: "peer-owner", signal: { kind: "answer", sdp: "x" } });
    await push(socket, { type: "screenShareSignal", streamId: "s1", signal: { kind: "answer", sdp: "x" } });
    expect(FakeRTCPeerConnection.instances[0].remoteDescription).toBeNull();
  });

  it("a close signal ends the viewing session", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareJoined", stream: stream() });
    await push(socket, { type: "screenShareSignal", streamId: "s1", fromPeerId: "peer-owner", signal: { kind: "close" } });
    expect(harness.voice.screenShareViewing.value).toBe(false);
    expect(FakeRTCPeerConnection.instances[0].closed).toBe(true);
  });
});

describe("screenShareNativeViewerJoined / screenShareViewerLeft", () => {
  it("offers to a TeamSpeak viewer only for the own active stream", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareNativeViewerJoined", streamId: "s1", viewerPeerId: "ts-viewer-1" });
    expect(FakeRTCPeerConnection.instances).toHaveLength(0);

    await harness.voice.startScreenShare();
    const [{ requestId }] = socket.sentOfType("screenShareStart") as [{ requestId: string }];
    await push(socket, { type: "screenShareStarted", owner: true, requestId, stream: stream({ streamId: "mine", ownerPeerId: "me" }) });
    await push(socket, { type: "screenShareNativeViewerJoined", streamId: "mine", viewerPeerId: "ts-viewer-1" });
    expect(socket.sentOfType("screenShareSignal")).toMatchObject([{ streamId: "mine", targetPeerId: "ts-viewer-1", signal: { kind: "offer" } }]);
    const peer = FakeRTCPeerConnection.instances[0];
    await push(socket, { type: "screenShareViewerLeft", viewerPeerId: "ts-viewer-1" });
    expect(peer.closed).toBe(true);
  });
});

describe("screenShareLeft", () => {
  it("leaves the watched stream and tells the gateway", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareJoined", stream: stream() });
    await push(socket, { type: "screenShareLeft", streamId: "other" });
    expect(harness.voice.screenShareViewing.value).toBe(true);
    await push(socket, { type: "screenShareLeft", streamId: "s1" });
    expect(harness.voice.screenShareViewing.value).toBe(false);
    expect(socket.sentOfType("screenShareLeave")).toEqual([{ type: "screenShareLeave", streamId: "s1" }]);
  });
});

describe("screenShareError", () => {
  it("records the code and message and abandons a pending start", async () => {
    const socket = await connected();
    await harness.voice.startScreenShare();
    await push(socket, { type: "screenShareError", code: "SCREEN_SHARE_LIMIT", message: "too many" });
    expect(harness.voice.screenShareErrorCode.value).toBe("SCREEN_SHARE_LIMIT");
    expect(harness.voice.screenShareError.value).toBe("too many");
    expect(harness.voice.screenShareStarting.value).toBe(false);
  });

  it("falls back to the default message and leaves a viewed stream", async () => {
    const socket = await connected();
    await push(socket, { type: "screenShareJoined", stream: stream() });
    await push(socket, { type: "screenShareError" });
    expect(harness.voice.screenShareError.value).toBe("屏幕共享操作失败");
    expect(harness.voice.screenShareErrorCode.value).toBe("");
    expect(harness.voice.screenShareViewing.value).toBe(false);
    expect(socket.sentOfType("screenShareLeave")).toEqual([{ type: "screenShareLeave", streamId: "s1" }]);
  });
});
