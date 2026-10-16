import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

beforeAll(() => {
  // The RNNoise worklet package extends AudioWorkletNode at import time; happy-dom has none.
  (globalThis as Record<string, unknown>).AudioWorkletNode ??= class {};
});
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => localStorage.clear());

describe("useRoomSession reset", () => {
  it("a second useRoomSession() call starts from empty state", async () => {
    const { useRoomSession } = await import("@/features/room/useRoomSession");
    const first = useRoomSession();
    first.roster.members.push({ id: 1, nickname: "A" });
    first.session.state.connected = true;
    first.roster.speakingIds.add(1);
    first.roster.whisperActive.value = true;
    const second = useRoomSession();
    expect(second.roster.members).toHaveLength(0);
    expect(second.session.state.connected).toBe(false);
    expect(second.roster.speakingIds.size).toBe(0);
    expect(second.roster.whisperActive.value).toBe(false);
  });

  it("a second useRoomSession() call starts from default audio state", async () => {
    const { useRoomSession } = await import("@/features/room/useRoomSession");
    const first = useRoomSession();
    first.audio.microphoneMuted.value = true;
    first.roster.volumes[3] = 2;
    first.audio.inputDevices.push({ deviceId: "d", label: "Mic" } as never);
    const second = useRoomSession();
    expect(second.audio.microphoneMuted.value).toBe(false);
    expect(second.roster.volumes).toEqual({});
    expect(second.audio.inputDevices).toHaveLength(0);
  });

  it("a second useRoomSession() call starts with no screen share", async () => {
    const { useRoomSession } = await import("@/features/room/useRoomSession");
    const first = useRoomSession();
    first.screenShare.screenShareActive.value = true;
    first.screenShare.screenShareStreams.push({ id: "x" } as never);
    const second = useRoomSession();
    expect(second.screenShare.screenShareActive.value).toBe(false);
    expect(second.screenShare.screenShareStreams).toHaveLength(0);
  });
});
