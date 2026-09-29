// Characterization of the outgoing actions and the connect lifecycle (Step V0.4): the exact JSON
// frames sent, the local state each action leaves behind, and the not-connected no-ops.
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceHarness, type VoiceHarness } from "./test-support/harness";
import type { FakeWebSocket } from "./test-support/fake-websocket";

let harness: VoiceHarness;

async function connected(message: Record<string, unknown> = {}): Promise<FakeWebSocket> {
  harness = await createVoiceHarness();
  const socket = await harness.joinAndConnect(message);
  socket.sent.length = 0;
  return socket;
}

afterEach(() => {
  vi.useRealTimers();
  harness?.dispose();
});

describe("connect", () => {
  it("posts the join ticket request and opens the ticketed socket", async () => {
    harness = await createVoiceHarness();
    harness.voice.connect("ts.example.test:9987", "Lobby", "Tester", "secret", "", false, "invite-1", true, "relay-1");
    expect(harness.voice.state).toMatchObject({ connecting: true, connected: false });
    await flushPromises();
    const [call] = harness.stubs.fetchCalls;
    expect(call.url).toBe("/api/join-ticket");
    expect(call.init?.method).toBe("POST");
    expect(JSON.parse(String(call.init?.body))).toEqual({ target: "ts.example.test:9987", nickname: "Tester", channel: "Lobby", serverPassword: "secret", invite: "invite-1", accelerated: true, accelerationRelayId: "relay-1" });
    expect(harness.socket().url).toContain("/ws/voice?ticket=test-ticket");
    expect(harness.socket().binaryType).toBe("arraybuffer");
  });

  it("sends a remembered identity only when asked to remember it", async () => {
    harness = await createVoiceHarness();
    harness.voice.connect("t", "c", "n", "", "id-material", true);
    await flushPromises();
    expect(JSON.parse(String(harness.stubs.fetchCalls[0].init?.body))).toMatchObject({ identity: "id-material", rememberIdentity: true });
    expect(harness.voice.identityMaterial.value).toBe("id-material");
    harness.voice.connect("t", "c", "n", "", "id-material", false);
    await flushPromises();
    const body = JSON.parse(String(harness.stubs.fetchCalls[1].init?.body));
    expect(body).not.toHaveProperty("identity");
    expect(body).not.toHaveProperty("rememberIdentity");
  });

  it("reports a refused join ticket as an error instead of opening a socket", async () => {
    harness = await createVoiceHarness({ joinTicket: { status: 429, body: { code: "RATE_LIMITED" } } });
    harness.voice.connect("t", "c", "n");
    await flushPromises();
    expect(harness.voice.state).toMatchObject({ connecting: false, connected: false, errorCode: "RATE_LIMITED", error: "请求过于频繁，请稍后重试" });
    expect(() => harness.socket()).toThrow();
  });

  it("a newer connect supersedes an older one whose ticket is still pending", async () => {
    harness = await createVoiceHarness();
    harness.voice.connect("t", "c", "first");
    harness.voice.connect("t", "c", "second");
    await flushPromises();
    const { FakeWebSocket } = await import("./test-support/fake-websocket");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("reconnectNow repeats the last connection, and does nothing without one or while connecting", async () => {
    harness = await createVoiceHarness();
    harness.voice.reconnectNow();
    await flushPromises();
    expect(harness.stubs.fetchCalls).toHaveLength(0);
    const socket = await harness.joinAndConnect();
    harness.voice.reconnectNow();
    await flushPromises();
    expect(harness.stubs.fetchCalls).toHaveLength(2);
    expect(JSON.parse(String(harness.stubs.fetchCalls[1].init?.body))).toMatchObject({ target: "ts.example.test", nickname: "Tester", channel: "Lobby" });
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined });
    harness.voice.reconnectNow();
    await flushPromises();
    expect(harness.stubs.fetchCalls).toHaveLength(2);
  });
});

describe("disconnect", () => {
  it("closes the socket with 1000 and resets the session state", async () => {
    const socket = await connected({ members: [{ id: 7, nickname: "Me" }, { id: 9, nickname: "Ana" }], whisperTargetIds: [9], whisperActive: true });
    harness.voice.chatMessages.push({ id: "m", scope: "channel", invokerName: "x", message: "y", timestamp: 1 });
    harness.voice.disconnect();
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined });
    expect(harness.voice.ws.value).toBeNull();
    expect(harness.voice.state).toMatchObject({ connected: false, connecting: false, reconnecting: false, reconnectFailed: false, tsClientId: 0, errorCode: "" });
    expect(harness.voice.members).toHaveLength(0);
    expect(harness.voice.channels).toHaveLength(0);
    expect(harness.voice.chatMessages).toHaveLength(0);
    expect(harness.voice.whisperTargetIds.size).toBe(0);
    expect(harness.voice.whisperActive.value).toBe(false);
    expect(harness.voice.identityMaterial.value).toBe("");
  });

  it("keeps a remembered identity across disconnect and drops the ability to reconnect", async () => {
    harness = await createVoiceHarness();
    harness.voice.connect("t", "c", "n", "", "id-material", true);
    await flushPromises();
    harness.socket().open();
    harness.socket().receive({ type: "connected", tsClientId: 7, members: [] });
    harness.voice.disconnect();
    expect(harness.voice.identityMaterial.value).toBe("id-material");
    harness.voice.reconnectNow();
    await flushPromises();
    expect(harness.stubs.fetchCalls).toHaveLength(1);
  });

  it("rejects pending commands and resolves pending latency probes with null", async () => {
    await connected();
    const move = harness.voice.moveClient(9, "2");
    const probe = harness.voice.measureLatency();
    const moveOutcome = expect(move).rejects.toThrow("语音连接已关闭");
    harness.voice.disconnect();
    await moveOutcome;
    expect(await probe).toBeNull();
  });

  it("sends a screenShareStop for an active own share before closing", async () => {
    const socket = await connected();
    await harness.voice.startScreenShare();
    const [{ requestId }] = socket.sentOfType("screenShareStart") as [{ requestId: string }];
    socket.receive({ type: "screenShareStarted", owner: true, requestId, stream: { streamId: "mine", ownerPeerId: "me" } });
    socket.sent.length = 0;
    harness.voice.disconnect();
    expect(socket.sentOfType("screenShareStop")).toEqual([{ type: "screenShareStop", streamId: "mine" }]);
  });
});

describe("commands", () => {
  it("switchChannel clears stale state and sends the channel, with a password only when given", async () => {
    const socket = await connected();
    harness.voice.state.error = "old";
    harness.voice.state.errorCode = "OLD";
    harness.voice.state.channelSwitchedChannelId = "3";
    harness.voice.switchChannel("5");
    harness.voice.switchChannel("6", "pw");
    expect(harness.voice.state).toMatchObject({ error: "", errorCode: "", channelSwitchedChannelId: "" });
    expect(socket.sentJson).toEqual([
      { type: "switchChannel", payload: { channelId: "5" } },
      { type: "switchChannel", payload: { channelId: "6", password: "pw" } },
    ]);
  });

  it("moveClient sends a request id and resolves on commandCompleted", async () => {
    const socket = await connected();
    const move = harness.voice.moveClient(9, "2", "pw");
    const [frame] = socket.sentJson;
    expect(frame).toMatchObject({ type: "moveClient", payload: { clientId: 9, channelId: "2", password: "pw" } });
    expect(String(frame.requestId)).toMatch(/^command-/);
    socket.receive({ type: "commandCompleted", requestId: frame.requestId });
    await expect(move).resolves.toBeUndefined();
  });

  it("moveClient times out after 8 s and rejects", async () => {
    vi.useFakeTimers();
    await connected();
    const move = harness.voice.moveClient(9, "2");
    const outcome = expect(move).rejects.toThrow("操作超时，请稍后重试");
    await vi.advanceTimersByTimeAsync(7_999);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
  });

  it("moveClient rejects at once when the socket is not open", async () => {
    harness = await createVoiceHarness();
    await expect(harness.voice.moveClient(9, "2")).rejects.toThrow("语音连接尚未就绪");
  });

  it("measureLatency sends a latencyProbe and resolves null without a socket", async () => {
    const socket = await connected();
    void harness.voice.measureLatency();
    expect(socket.sentJson).toMatchObject([{ type: "latencyProbe", payload: { sequence: expect.stringMatching(/^latency-/) } }]);
    harness.dispose();
    harness = await createVoiceHarness();
    expect(await harness.voice.measureLatency()).toBeNull();
  });

  it("sendPoke and setAway trim and cap the message at 200 characters", async () => {
    const socket = await connected();
    harness.voice.sendPoke(9, `  ${"a".repeat(300)}  `);
    harness.voice.sendPoke(9);
    harness.voice.setAway(true, " brb ");
    harness.voice.setAway(false);
    expect(socket.sentJson).toEqual([
      { type: "poke", payload: { clientId: 9, message: "a".repeat(200) } },
      { type: "poke", payload: { clientId: 9, message: "" } },
      { type: "setAway", payload: { away: true, message: "brb" } },
      { type: "setAway", payload: { away: false, message: "" } },
    ]);
  });

  it("does nothing while the socket is not open", async () => {
    harness = await createVoiceHarness();
    harness.voice.switchChannel("1");
    harness.voice.sendPoke(9);
    harness.voice.setAway(true);
    expect(() => harness.socket()).toThrow();
  });
});

describe("chat", () => {
  it("sendTextMessage trims, sends and records an own channel message", async () => {
    const socket = await connected();
    harness.voice.sendTextMessage("  hello  ", "4");
    harness.voice.sendTextMessage("   ");
    harness.voice.sendTextMessage("x".repeat(501));
    expect(socket.sentJson).toEqual([{ type: "sendTextMessage", payload: { message: "hello" } }]);
    expect(harness.voice.chatMessages).toHaveLength(1);
    expect(harness.voice.chatMessages[0]).toMatchObject({ scope: "channel", targetId: "4", senderId: 7, invokerName: "你", message: "hello", isSelf: true });
    expect(harness.voice.chatMessages[0].id).toMatch(/^self-/);
  });

  it("sendServerMessage records a server-scope message", async () => {
    const socket = await connected();
    harness.voice.sendServerMessage(" all ");
    expect(socket.sentJson).toEqual([{ type: "sendServerMessage", payload: { message: "all" } }]);
    expect(harness.voice.chatMessages[0]).toMatchObject({ scope: "server", message: "all", isSelf: true });
  });

  it("sendPrivateMessage records the conversation under the target client", async () => {
    const socket = await connected();
    harness.voice.sendPrivateMessage(9, " psst ", "4");
    harness.voice.sendPrivateMessage(9, "");
    expect(socket.sentJson).toEqual([{ type: "sendPrivateMessage", payload: { clientId: 9, message: "psst" } }]);
    expect(harness.voice.chatMessages[0]).toMatchObject({ scope: "private", targetId: "4", conversationId: "9", isSelf: true });
  });
});

describe("whisper and mute", () => {
  it("setWhisperTargets dedupes, drops invalid ids and self, caps at 8, and reports the result", async () => {
    const socket = await connected();
    harness.voice.setWhisperTargets([9, 9, 7, 0, 70000, 1.5, 1, 2, 3, 4, 5, 6, 8, 10]);
    expect(socket.sentJson).toEqual([{ type: "setWhisperTargets", payload: { targetIds: [9, 1, 2, 3, 4, 5, 6, 8] } }]);
    expect([...harness.voice.whisperTargetIds]).toEqual([9, 1, 2, 3, 4, 5, 6, 8]);
  });

  it("setWhisperTargets with nothing valid also switches whisper off", async () => {
    const socket = await connected({ whisperTargetIds: [9], whisperActive: true });
    socket.sent.length = 0;
    harness.voice.setWhisperTargets([]);
    expect(harness.voice.whisperActive.value).toBe(false);
    expect(socket.sentJson).toEqual([{ type: "setWhisperTargets", payload: { targetIds: [] } }]);
  });

  it("setWhisperActive refuses to activate without targets", async () => {
    const socket = await connected();
    harness.voice.setWhisperActive(true);
    expect(socket.sentJson).toEqual([]);
    harness.voice.setWhisperTargets([9]);
    socket.sent.length = 0;
    harness.voice.setWhisperActive(true);
    harness.voice.setWhisperActive(false);
    expect(socket.sentJson).toEqual([{ type: "setWhisperActive", payload: { active: true } }, { type: "setWhisperActive", payload: { active: false } }]);
    expect(harness.voice.whisperActive.value).toBe(false);
  });

  it("setMicrophoneMuted updates the flag and tells the gateway", async () => {
    const socket = await connected({ members: [{ id: 7, nickname: "Me" }] });
    socket.receive({ type: "voiceActivity", clientIds: [7] });
    expect(harness.voice.speakingIds.has(7)).toBe(true);
    harness.voice.setMicrophoneMuted(true);
    expect(harness.voice.microphoneMuted.value).toBe(true);
    expect(socket.sentJson).toEqual([{ type: "setMicrophoneMuted", payload: { muted: true } }]);
    expect(harness.voice.speakingIds.has(7)).toBe(false);
    harness.voice.setMicrophoneMuted(false);
    expect(harness.voice.microphoneMuted.value).toBe(false);
    expect(socket.sentJson.at(-1)).toEqual({ type: "setMicrophoneMuted", payload: { muted: false } });
  });
});

describe("clearError", () => {
  it("clears the connection error and code", async () => {
    await connected();
    harness.voice.state.error = "boom";
    harness.voice.state.errorCode = "X";
    harness.voice.clearError();
    expect(harness.voice.state).toMatchObject({ error: "", errorCode: "" });
  });
});
