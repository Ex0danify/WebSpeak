// useRoomActions on its own (Step V2.2): a FakeWebSocket in the session store, no composable around it.
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceSessionStore } from "../../stores/voiceSession";
import { FakeWebSocket } from "./test-support/fake-websocket";
import { useRoomActions } from "./useRoomActions";

let socket: FakeWebSocket;

function setup(open = true) {
  const session = useVoiceSessionStore();
  socket = new FakeWebSocket("ws://test");
  if (open) socket.open();
  session.ws = socket as unknown as WebSocket;
  return { session, actions: useRoomActions({ protocolErrorMessage: (code, fallback) => `${code}:${fallback}` }) };
}

beforeEach(() => {
  setActivePinia(createPinia());
  FakeWebSocket.reset();
  vi.stubGlobal("WebSocket", FakeWebSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sendCmd", () => {
  it("sends {type, payload} and adds requestId only when given", () => {
    const { actions } = setup();
    actions.sendCmd("a", { x: 1 });
    actions.sendCmd("b", {}, "req-1");
    expect(socket.sentJson).toEqual([{ type: "a", payload: { x: 1 } }, { type: "b", payload: {}, requestId: "req-1" }]);
  });

  it("does nothing while the socket is not open", () => {
    const { actions } = setup(false);
    actions.sendCmd("a");
    expect(socket.sent).toHaveLength(0);
  });
});

describe("sendCommandAndWait", () => {
  it("rejects at once when the socket is not open", async () => {
    const { actions } = setup(false);
    await expect(actions.sendCommandAndWait("moveClient", {})).rejects.toThrow("语音连接尚未就绪");
  });

  it("registers the request, sends its id, and resolves when the router settles it", async () => {
    const { actions } = setup();
    const done = actions.sendCommandAndWait("moveClient", { clientId: 4 });
    const [frame] = socket.sentJson;
    expect(frame).toMatchObject({ type: "moveClient", payload: { clientId: 4 } });
    const requestId = frame.requestId as string;
    expect(requestId).toMatch(/^command-/);
    actions.pendingCommands.get(requestId)!.resolve();
    await expect(done).resolves.toBeUndefined();
  });

  it("times out, forgets the request and rejects", async () => {
    vi.useFakeTimers();
    const { actions } = setup();
    const done = actions.sendCommandAndWait("moveClient", {}, 500);
    const caught = done.then(() => new Error("resolved"), (error: Error) => error);
    await vi.advanceTimersByTimeAsync(500);
    expect((await caught).message).toBe("操作超时，请稍后重试");
    expect(actions.pendingCommands.size).toBe(0);
  });

  it("gives each request its own id", () => {
    const { actions } = setup();
    void actions.sendCommandAndWait("a", {}).catch(() => {});
    void actions.sendCommandAndWait("a", {}).catch(() => {});
    const [one, two] = socket.sentJson.map((frame) => frame.requestId);
    expect(one).not.toBe(two);
  });

  it("rejectPendingCommands settles every waiter with the error and clears the timers", async () => {
    vi.useFakeTimers();
    const { actions } = setup();
    const first = actions.sendCommandAndWait("a", {}).then(() => new Error("resolved"), (error: Error) => error);
    const second = actions.sendCommandAndWait("b", {}).then(() => new Error("resolved"), (error: Error) => error);
    actions.rejectPendingCommands(new Error("closed"));
    expect((await first).message).toBe("closed");
    expect((await second).message).toBe("closed");
    expect(actions.pendingCommands.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("channel and roster commands", () => {
  it("switchChannel clears the error state and sends the password only when given", () => {
    const { session, actions } = setup();
    session.state.error = "old";
    session.state.errorCode = "OLD";
    session.state.channelSwitchedChannelId = "9";
    actions.switchChannel("5");
    actions.switchChannel("6", "pw");
    expect(session.state).toMatchObject({ error: "", errorCode: "", channelSwitchedChannelId: "" });
    expect(socket.sentJson).toEqual([
      { type: "switchChannel", payload: { channelId: "5" } },
      { type: "switchChannel", payload: { channelId: "6", password: "pw" } },
    ]);
  });

  it("moveClient waits for completion", () => {
    const { actions } = setup();
    void actions.moveClient(3, "8", "pw").catch(() => {});
    expect(socket.sentJson[0]).toMatchObject({ type: "moveClient", payload: { clientId: 3, channelId: "8", password: "pw" } });
    expect(socket.sentJson[0].requestId).toBeTruthy();
  });

  it("poke and away trim and cap the message at 200 characters", () => {
    const { actions } = setup();
    actions.sendPoke(2, `  ${"x".repeat(300)}  `);
    actions.setAway(true, "  brb ");
    expect(socket.sentJson).toEqual([
      { type: "poke", payload: { clientId: 2, message: "x".repeat(200) } },
      { type: "setAway", payload: { away: true, message: "brb" } },
    ]);
  });
});

describe("chat", () => {
  it("sendTextMessage sends, then records the message as the person's own", () => {
    const { session, actions } = setup();
    session.state.tsClientId = 7;
    actions.sendTextMessage("  hi  ", "chan-1");
    expect(socket.sentJson).toEqual([{ type: "sendTextMessage", payload: { message: "hi" } }]);
    expect(session.chatMessages).toHaveLength(1);
    expect(session.chatMessages[0]).toMatchObject({ scope: "channel", targetId: "chan-1", senderId: 7, invokerName: "你", message: "hi", isSelf: true });
    expect(session.chatMessages[0].id).toMatch(/^self-/);
  });

  it("drops empty and over-500-character messages without sending", () => {
    const { session, actions } = setup();
    actions.sendTextMessage("   ");
    actions.sendServerMessage("x".repeat(501));
    actions.sendPrivateMessage(3, "");
    expect(socket.sent).toHaveLength(0);
    expect(session.chatMessages).toHaveLength(0);
  });

  it("server and private messages carry their scope", () => {
    const { session, actions } = setup();
    actions.sendServerMessage("all");
    actions.sendPrivateMessage(3, "psst", "t1");
    expect(socket.sentJson).toEqual([
      { type: "sendServerMessage", payload: { message: "all" } },
      { type: "sendPrivateMessage", payload: { clientId: 3, message: "psst" } },
    ]);
    expect(session.chatMessages[0]).toMatchObject({ scope: "server", message: "all" });
    expect(session.chatMessages[1]).toMatchObject({ scope: "private", targetId: "t1", conversationId: "3", message: "psst" });
  });
});

describe("latency probes", () => {
  it("resolves null without a socket that is open", async () => {
    const { actions } = setup(false);
    await expect(actions.measureLatency()).resolves.toBeNull();
    expect(socket.sent).toHaveLength(0);
  });

  it("sends a probe with a sequence and waits for the router to settle it", async () => {
    const { actions } = setup();
    const result = actions.measureLatency();
    const [frame] = socket.sentJson;
    expect(frame.type).toBe("latencyProbe");
    const sequence = (frame.payload as { sequence: string }).sequence;
    expect(sequence).toMatch(/^latency-/);
    const pending = actions.pendingLatencyProbes.get(sequence)!;
    pending.resolve({ browserRttMs: 5, teamSpeakLatencyMs: null, teamSpeakReachable: true });
    await expect(result).resolves.toMatchObject({ browserRttMs: 5 });
  });

  it("times out to null and forgets the probe", async () => {
    vi.useFakeTimers();
    const { actions } = setup();
    const result = actions.measureLatency(300);
    await vi.advanceTimersByTimeAsync(300);
    await expect(result).resolves.toBeNull();
    expect(actions.pendingLatencyProbes.size).toBe(0);
  });

  it("clearLatencyProbes resolves every probe with null and clears the timers", async () => {
    vi.useFakeTimers();
    const { actions } = setup();
    const a = actions.measureLatency();
    const b = actions.measureLatency();
    actions.clearLatencyProbes();
    await expect(Promise.all([a, b])).resolves.toEqual([null, null]);
    expect(actions.pendingLatencyProbes.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("whisper", () => {
  it("setWhisperTargets de-duplicates, drops invalid ids and the own id, caps at 8, and sends the list", () => {
    const { session, actions } = setup();
    session.state.tsClientId = 5;
    actions.setWhisperTargets([1, 1, 2, 5, 0, -3, 1.5, 70000, 3, 4, 6, 7, 8, 9, 10, 11]);
    expect([...session.whisperTargetIds]).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
    expect(socket.sentJson).toEqual([{ type: "setWhisperTargets", payload: { targetIds: [1, 2, 3, 4, 6, 7, 8, 9] } }]);
  });

  it("an empty target list switches whispering off", () => {
    const { session, actions } = setup();
    session.whisperTargetIds.add(2);
    session.whisperActive = true;
    actions.setWhisperTargets([]);
    expect(session.whisperActive).toBe(false);
    expect(session.whisperTargetIds.size).toBe(0);
  });

  it("setWhisperActive(true) is a no-op without targets", () => {
    const { session, actions } = setup();
    actions.setWhisperActive(true);
    expect(session.whisperActive).toBe(false);
    expect(socket.sent).toHaveLength(0);
    session.whisperTargetIds.add(2);
    actions.setWhisperActive(true);
    expect(session.whisperActive).toBe(true);
    expect(socket.sentJson).toEqual([{ type: "setWhisperActive", payload: { active: true } }]);
  });

  it("applyWhisperState filters ids and only stays active with targets", () => {
    const { session, actions } = setup();
    session.state.tsClientId = 5;
    actions.applyWhisperState([1, 5, "x", 0, 2], true);
    expect([...session.whisperTargetIds]).toEqual([1, 2]);
    expect(session.whisperActive).toBe(true);
    actions.applyWhisperState([5], true);
    expect(session.whisperTargetIds.size).toBe(0);
    expect(session.whisperActive).toBe(false);
    actions.applyWhisperState("nope", true);
    expect(session.whisperActive).toBe(false);
    actions.applyWhisperState([1], "yes");
    expect(session.whisperActive).toBe(false);
  });
});
