import { createPinia, setActivePinia } from "pinia";
import { isReactive } from "vue";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useScreenShareStore } from "./screenShareStore";

beforeAll(() => {
  // The RNNoise worklet package extends AudioWorkletNode at import time; happy-dom has none.
  (globalThis as Record<string, unknown>).AudioWorkletNode ??= class {};
});
beforeEach(() => setActivePinia(createPinia()));

describe("useScreenShareStore", () => {
  it("starts idle", () => {
    const s = useScreenShareStore();
    expect(s.screenShareStreams).toHaveLength(0);
    expect([s.screenShareActive, s.screenShareStarting, s.screenShareViewing]).toEqual([false, false, false]);
    expect([s.screenShareActiveStreamId, s.screenShareViewingStreamId, s.screenShareError, s.screenShareErrorCode]).toEqual([
      "",
      "",
      "",
      "",
    ]);
    expect(s.screenShareRemoteStream).toBeNull();
    expect(s.screenShareRemoteVolume).toBe(1);
    expect(s.screenShareWebRtcStats).toEqual({ updatedAt: null, capture: null, peers: [] });
  });

  it("reset() restores every value and keeps the reactive identities", () => {
    const s = useScreenShareStore();
    const { screenShareStreams, screenShareWebRtcStats } = s;
    s.screenShareStreams.push({ id: "x" } as never);
    s.screenShareActive = true;
    s.screenShareStarting = true;
    s.screenShareActiveStreamId = "a";
    s.screenShareViewing = true;
    s.screenShareViewingStreamId = "b";
    s.screenShareRemoteStream = {} as MediaStream;
    s.screenShareError = "e";
    s.screenShareErrorCode = "E";
    s.screenShareRemoteVolume = 0.2;
    s.screenShareWebRtcStats.updatedAt = 5;
    s.screenShareWebRtcStats.peers.push({} as never);
    s.reset();
    expect(s.screenShareStreams).toHaveLength(0);
    expect([s.screenShareActive, s.screenShareStarting, s.screenShareViewing]).toEqual([false, false, false]);
    expect([s.screenShareActiveStreamId, s.screenShareViewingStreamId, s.screenShareError, s.screenShareErrorCode]).toEqual([
      "",
      "",
      "",
      "",
    ]);
    expect(s.screenShareRemoteStream).toBeNull();
    expect(s.screenShareRemoteVolume).toBe(1);
    expect(s.screenShareWebRtcStats).toEqual({ updatedAt: null, capture: null, peers: [] });
    expect(s.screenShareStreams).toBe(screenShareStreams);
    expect(s.screenShareWebRtcStats).toBe(screenShareWebRtcStats);
    expect(isReactive(s.screenShareWebRtcStats)).toBe(true);
  });
});
