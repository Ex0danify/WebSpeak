// Characterization of the chat, whisper, latency, command and audio-transport messages
// (Step V0.3b, part 1). The screen-share family is in messages.screenshare.test.ts.
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceHarness, type VoiceHarness } from "./test-support/harness";
import { FakeMediaStream, FakeMediaStreamTrack, FakeRTCPeerConnection } from "./test-support/browser-stubs";
import type { FakeWebSocket } from "./test-support/fake-websocket";

let harness: VoiceHarness;

async function connected(message: Record<string, unknown> = {}): Promise<FakeWebSocket> {
  harness = await createVoiceHarness();
  return harness.joinAndConnect(message);
}

async function push(socket: FakeWebSocket, message: Record<string, unknown>): Promise<void> {
  socket.receive(message);
  await flushPromises();
}

afterEach(() => {
  vi.useRealTimers();
  harness?.dispose();
});

describe("chatMessage", () => {
  it("stores a channel message with defaults for missing fields", async () => {
    const socket = await connected();
    await push(socket, { type: "chatMessage", scope: "channel", invokerId: 9, invokerName: "Ana", message: "hi", timestamp: 123, senderUid: "u9", targetId: 4 });
    expect(harness.voice.chatMessages).toHaveLength(1);
    expect(harness.voice.chatMessages[0]).toMatchObject({ scope: "channel", targetId: "4", senderId: 9, senderUid: "u9", invokerName: "Ana", message: "hi", timestamp: 123 });
    expect(harness.voice.chatMessages[0].id).toMatch(/^remote-/);
    expect(harness.voice.chatMessages[0]).not.toHaveProperty("conversationId");
  });

  it("treats an unknown scope as a system message and 0 as no target", async () => {
    const socket = await connected();
    await push(socket, { type: "chatMessage", scope: "weird", invokerId: 9, targetId: "0" });
    expect(harness.voice.chatMessages[0]).toMatchObject({ scope: "system", invokerName: "Unknown", message: "" });
    expect(harness.voice.chatMessages[0]).not.toHaveProperty("targetId");
  });

  it("files a private message under the sender's conversation", async () => {
    const socket = await connected();
    await push(socket, { type: "chatMessage", scope: "private", invokerId: 9, invokerName: "Ana", message: "psst" });
    expect(harness.voice.chatMessages[0]).toMatchObject({ scope: "private", conversationId: "9" });
  });

  it("drops an echo of the own message", async () => {
    const socket = await connected();
    await push(socket, { type: "chatMessage", scope: "channel", invokerId: 7, message: "mine" });
    expect(harness.voice.chatMessages).toHaveLength(0);
  });
});

describe("serverEvent / pokeReceived", () => {
  it("appends a server event only when it has a string id", async () => {
    const socket = await connected();
    await push(socket, { type: "serverEvent", event: { id: "e1", kind: "join" } });
    await push(socket, { type: "serverEvent", event: { id: 5 } });
    await push(socket, { type: "serverEvent" });
    expect(harness.voice.serverEvents).toEqual([{ id: "e1", kind: "join" }]);
  });

  it("records a poke with defaults", async () => {
    const socket = await connected();
    await push(socket, { type: "pokeReceived", invokerId: 9, invokerUid: "u9", invokerName: "Ana", message: "wake up", timestamp: 55 });
    await push(socket, { type: "pokeReceived" });
    expect(harness.voice.pokeNotifications).toHaveLength(2);
    expect(harness.voice.pokeNotifications[0]).toMatchObject({ invokerId: 9, invokerUid: "u9", invokerName: "Ana", message: "wake up", timestamp: 55 });
    expect(harness.voice.pokeNotifications[0].id).toMatch(/^poke-/);
    expect(harness.voice.pokeNotifications[1]).toMatchObject({ invokerId: 0, invokerUid: "", invokerName: "Unknown", message: "" });
  });
});

describe("latencyPong", () => {
  it("resolves the pending probe with the gateway's measurements", async () => {
    const socket = await connected();
    const probe = harness.voice.measureLatency();
    const [{ payload }] = socket.sentOfType("latencyProbe") as [{ payload: { sequence: string } }];
    await push(socket, { type: "latencyPong", sequence: payload.sequence, teamSpeakLatencyMs: 31, teamSpeakReachable: true, teamSpeakErrorCode: "SLOW" });
    const result = await probe;
    expect(result).toMatchObject({ teamSpeakLatencyMs: 31, teamSpeakReachable: true, teamSpeakErrorCode: "SLOW" });
    expect(result?.browserRttMs).toBeGreaterThanOrEqual(0);
  });

  it("ignores a pong for an unknown sequence, and the probe times out to null", async () => {
    vi.useFakeTimers();
    const socket = await connected();
    const probe = harness.voice.measureLatency(500);
    socket.receive({ type: "latencyPong", sequence: "nope", teamSpeakReachable: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(await probe).toBeNull();
  });
});

describe("whisperTargets", () => {
  it("replaces the whisper state, filtering invalid ids and the own id", async () => {
    const socket = await connected();
    await push(socket, { type: "whisperTargets", targetIds: [3, 7, 4], active: true });
    expect([...harness.voice.whisperTargetIds]).toEqual([3, 4]);
    expect(harness.voice.whisperActive.value).toBe(true);
    await push(socket, { type: "whisperTargets", targetIds: [3], active: false });
    expect([...harness.voice.whisperTargetIds]).toEqual([3]);
    expect(harness.voice.whisperActive.value).toBe(false);
    await push(socket, { type: "whisperTargets" });
    expect(harness.voice.whisperTargetIds.size).toBe(0);
  });
});

describe("voiceActivity", () => {
  it("marks positive integer ids as speaking and lets them expire", async () => {
    vi.useFakeTimers();
    const socket = await connected();
    socket.receive({ type: "voiceActivity", clientIds: [3, 0, -1, 2.5, "4", 5] });
    expect([...harness.voice.speakingIds].sort()).toEqual([3, 5]);
    await vi.advanceTimersByTimeAsync(400);
    expect(harness.voice.speakingIds.size).toBe(0);
  });

  it("ignores a message with no id list", async () => {
    const socket = await connected();
    await push(socket, { type: "voiceActivity" });
    expect(harness.voice.speakingIds.size).toBe(0);
  });
});

describe("commandCompleted / error with a request id", () => {
  function requestIdOf(socket: FakeWebSocket): string {
    const frame = socket.sentJson.find((candidate) => candidate.type === "moveClient");
    return String(frame?.requestId);
  }

  it("commandCompleted resolves the matching pending command", async () => {
    const socket = await connected();
    const move = harness.voice.moveClient(9, "2");
    await push(socket, { type: "commandCompleted", requestId: requestIdOf(socket) });
    await expect(move).resolves.toBeUndefined();
  });

  it("commandCompleted for an unknown request id changes nothing", async () => {
    const socket = await connected();
    const move = harness.voice.moveClient(9, "2");
    await push(socket, { type: "commandCompleted", requestId: "other" });
    let settled = false;
    void move.then(() => { settled = true; }, () => { settled = true; });
    await flushPromises();
    expect(settled).toBe(false);
    const outcome = expect(move).rejects.toThrow("语音连接已关闭");
    harness.voice.disconnect();
    await outcome;
  });

  it("error with the request id rejects that command with the mapped code", async () => {
    const socket = await connected();
    const move = harness.voice.moveClient(9, "2");
    const outcome = expect(move).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await push(socket, { type: "error", requestId: requestIdOf(socket), error: { code: "PERMISSION_DENIED", message: "no" } });
    await outcome;
    expect(harness.voice.state.errorCode).toBe("PERMISSION_DENIED");
  });
});

describe("audioError", () => {
  it("raises an audio notice, with the encoder-specific text for AUDIO_ENCODER_UNAVAILABLE", async () => {
    const socket = await connected();
    await push(socket, { type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "opus missing" });
    expect(harness.voice.state.audioNoticeCode).toBe("AUDIO_ENCODER_UNAVAILABLE");
    expect(harness.voice.state.audioNotice).toContain("音频编码器不可用");
    expect(harness.voice.state.audioNotice).toContain("opus missing");
    await push(socket, { type: "audioError" });
    expect(harness.voice.state.audioNoticeCode).toBe("AUDIO_ERROR");
    expect(harness.voice.state.audioNotice).toContain("音频链路异常");
  });
});

describe("webrtcAnswer / webrtcError", () => {
  async function connectedWithWebRtc(): Promise<FakeWebSocket> {
    harness = await createVoiceHarness({ getUserMedia: async () => new FakeMediaStream([new FakeMediaStreamTrack("audio")]) });
    harness.voice.noiseSuppressionEnabled.value = false;
    const socket = await harness.joinAndConnect({ webrtcAvailable: true });
    await flushPromises();
    return socket;
  }

  it("applies an answer to the open peer", async () => {
    const socket = await connectedWithWebRtc();
    await push(socket, { type: "webrtcAnswer", payload: { sdp: { type: "answer", sdp: "remote" } } });
    expect(FakeRTCPeerConnection.instances[0].remoteDescription).toEqual({ type: "answer", sdp: "remote" });
  });

  it("ignores an answer that is not a session description, or arrives without a peer", async () => {
    const socket = await connectedWithWebRtc();
    await push(socket, { type: "webrtcAnswer", payload: { sdp: { type: "offer", sdp: "x" } } });
    await push(socket, { type: "webrtcAnswer" });
    expect(FakeRTCPeerConnection.instances[0].remoteDescription).toBeNull();
  });

  it("webrtcError falls back to the PCM socket path once, with a visible notice", async () => {
    const socket = await connectedWithWebRtc();
    await push(socket, { type: "webrtcError", code: "WEBRTC_DISABLED" });
    expect(socket.sentOfType("webrtcStop")).toHaveLength(1);
    expect(FakeRTCPeerConnection.instances[0].closed).toBe(true);
    expect(harness.voice.state.audioNoticeCode).toBe("WEBRTC_FALLBACK");
    expect(harness.voice.state.audioNotice).toContain("WEBRTC_DISABLED");
    await push(socket, { type: "webrtcError", code: "AGAIN" });
    expect(socket.sentOfType("webrtcStop")).toHaveLength(1);
  });
});
