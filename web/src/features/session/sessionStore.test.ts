import { createPinia, setActivePinia } from "pinia";
import { isReactive, isRef } from "vue";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "./sessionStore";

beforeAll(() => {
  // The RNNoise worklet package extends AudioWorkletNode at import time; happy-dom has none.
  (globalThis as Record<string, unknown>).AudioWorkletNode ??= class {};
});
beforeEach(() => setActivePinia(createPinia()));

describe("useSessionStore", () => {
  it("starts with the initial session state", () => {
    const s = useSessionStore();
    expect(s.state).toEqual({
      connected: false,
      connecting: false,
      reconnecting: false,
      reconnectAttempt: 0,
      reconnectFailed: false,
      tsClientId: 0,
      error: "",
      errorCode: "",
      microphoneError: "",
      microphoneErrorCode: "",
      audioNotice: "",
      audioNoticeCode: "",
      channelSwitchedChannelId: "",
    });
    expect(s.ws).toBeNull();
    expect(s.whisperActive).toBe(false);
    for (const list of [s.members, s.channels, s.chatMessages, s.serverEvents, s.pokeNotifications]) expect(list).toHaveLength(0);
    expect(s.speakingIds.size + s.whisperTargetIds.size).toBe(0);
  });

  it("reset() restores every value", () => {
    const s = useSessionStore();
    s.state.connected = true;
    s.state.tsClientId = 9;
    s.state.error = "boom";
    s.members.push({ id: 1, nickname: "A" });
    s.channels.push({ id: "1", name: "Lobby" } as never);
    s.chatMessages.push({ id: "m" } as never);
    s.serverEvents.push({ id: "e" } as never);
    s.pokeNotifications.push({ id: "p", invokerId: 1, invokerUid: "u", invokerName: "n", message: "hi", timestamp: 1 });
    s.speakingIds.add(1);
    s.whisperTargetIds.add(2);
    s.whisperActive = true;
    s.ws = {} as WebSocket;
    s.reset();
    expect(s.state.connected).toBe(false);
    expect(s.state.tsClientId).toBe(0);
    expect(s.state.error).toBe("");
    for (const list of [s.members, s.channels, s.chatMessages, s.serverEvents, s.pokeNotifications]) expect(list).toHaveLength(0);
    expect(s.speakingIds.size + s.whisperTargetIds.size).toBe(0);
    expect(s.whisperActive).toBe(false);
    expect(s.ws).toBeNull();
  });

  it("keeps the same reactive objects across reset()", () => {
    const s = useSessionStore();
    const { state, members, speakingIds } = s;
    s.reset();
    expect(s.state).toBe(state);
    expect(s.members).toBe(members);
    expect(s.speakingIds).toBe(speakingIds);
    expect(isReactive(s.state) && isReactive(s.members) && isReactive(s.speakingIds)).toBe(true);
  });

  it("stores the socket unproxied", () => {
    const s = useSessionStore();
    const sock = new (class {
      readyState = 1;
    })() as unknown as WebSocket;
    s.ws = sock;
    expect(s.ws).toBe(sock);
    expect(isRef(s.$state.ws) || s.$state.ws === sock).toBe(true);
  });
});
