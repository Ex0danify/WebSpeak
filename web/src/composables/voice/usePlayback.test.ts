// usePlayback on its own (Step V3.2): speaking state, per-client teardown and the frame filter.
// The scheduling decisions (play-ahead cap, decode queue reset) are pinned through the public API in hotpath.test.ts.
import { createPinia, setActivePinia } from "pinia";
import { ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceSessionStore } from "../../stores/voiceSession";
import { SPEAKING_HOLD_MS } from "./audio-constants";
import { FakeAudioContext, FakeAudioDecoder, installBrowserStubs, type BrowserStubs } from "./test-support/browser-stubs";
import type { SinkAudioContext } from "./types";
import { usePlayback } from "./usePlayback";

let stubs: BrowserStubs;
let ctx: FakeAudioContext;
let webrtcActive: Ref<boolean>;
let outputVolume: number;

function setup() {
  const session = useVoiceSessionStore();
  const getAudioCtx = vi.fn(() => ctx as unknown as SinkAudioContext);
  const playback = usePlayback({ getAudioCtx, effectiveOutputVolume: () => outputVolume, webrtcActive });
  return { session, playback, getAudioCtx };
}

/** A gateway frame: `[codec][clientId BE]` then opus bytes. */
function frame(clientId: number, payloadLength = 4): Uint8Array {
  return Uint8Array.from([4, clientId >> 8, clientId & 0xff, ...new Array(payloadLength).fill(7)]);
}

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  stubs = installBrowserStubs();
  ctx = new FakeAudioContext();
  webrtcActive = ref<boolean>(false);
  outputVolume = 1;
});
afterEach(() => {
  vi.useRealTimers();
  stubs.restore();
});

describe("speaking state", () => {
  it("marks a client as speaking and forgets it after the hold time", () => {
    const { session, playback } = setup();
    playback.markSpeaking(7);
    expect(session.speakingIds.has(7)).toBe(true);
    vi.advanceTimersByTime(SPEAKING_HOLD_MS - 1);
    expect(session.speakingIds.has(7)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(session.speakingIds.has(7)).toBe(false);
  });

  it("restarts the hold time on every mark", () => {
    const { session, playback } = setup();
    playback.markSpeaking(7);
    vi.advanceTimersByTime(SPEAKING_HOLD_MS - 10);
    playback.markSpeaking(7);
    vi.advanceTimersByTime(SPEAKING_HOLD_MS - 10);
    expect(session.speakingIds.has(7)).toBe(true);
    vi.advanceTimersByTime(10);
    expect(session.speakingIds.has(7)).toBe(false);
  });

  it("ignores client id 0", () => {
    const { session, playback } = setup();
    playback.markSpeaking(0);
    expect(session.speakingIds.size).toBe(0);
  });

  it("clearSpeaking drops one client and its timer, clearSpeakingState drops all", () => {
    const { session, playback } = setup();
    playback.markSpeaking(1);
    playback.markSpeaking(2);
    playback.clearSpeaking(1);
    expect([...session.speakingIds]).toEqual([2]);
    playback.markSpeaking(3);
    playback.clearSpeakingState();
    expect(session.speakingIds.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("handleAudioFrame", () => {
  it("marks the sender speaking and gives the decoder the payload after the 3-byte header", () => {
    const { session, playback } = setup();
    playback.handleAudioFrame(frame(9));
    expect(session.speakingIds.has(9)).toBe(true);
    expect(FakeAudioDecoder.instances).toHaveLength(1);
    const chunk = FakeAudioDecoder.instances[0].chunks[0] as { init: { data: Uint8Array } };
    expect([...chunk.init.data]).toEqual([7, 7, 7, 7]);
  });

  it("keeps one decoder per client", () => {
    const { playback } = setup();
    playback.handleAudioFrame(frame(9));
    playback.handleAudioFrame(frame(9));
    playback.handleAudioFrame(frame(10));
    expect(FakeAudioDecoder.instances).toHaveLength(2);
    expect(FakeAudioDecoder.instances[0].chunks).toHaveLength(2);
  });

  it("drops frames while WebRTC carries the downlink", () => {
    const { session, playback, getAudioCtx } = setup();
    webrtcActive.value = true;
    playback.handleAudioFrame(frame(9));
    expect(session.speakingIds.size).toBe(0);
    expect(getAudioCtx).not.toHaveBeenCalled();
  });

  it("drops frames shorter than 4 bytes, and our own echo", () => {
    const { session, playback } = setup();
    session.state.tsClientId = 5;
    playback.handleAudioFrame(Uint8Array.from([4, 0, 9]));
    playback.handleAudioFrame(frame(5));
    expect(session.speakingIds.size).toBe(0);
    expect(FakeAudioDecoder.instances).toHaveLength(0);
  });

  it("shows the sender as speaking even when the payload is under 3 bytes and never decoded", () => {
    const { session, playback } = setup();
    playback.handleAudioFrame(frame(9, 2));
    expect(session.speakingIds.has(9)).toBe(true);
    expect(FakeAudioDecoder.instances).toHaveLength(0);
    playback.handleAudioFrame(frame(9, 3));
    expect(FakeAudioDecoder.instances[0].chunks).toHaveLength(1);
  });

  it("gives a new client's gain node the output volume (member volume defaults to 1)", () => {
    const { playback } = setup();
    outputVolume = 0.5;
    playback.handleAudioFrame(frame(9));
    expect(playback.remoteGains.get(9)!.gain.value).toBe(0.5);
  });
});

describe("teardown", () => {
  it("clearRemotePlayback closes the client's decoder and stops its sources, leaving others alone", () => {
    const { playback } = setup();
    playback.handleAudioFrame(frame(1));
    playback.handleAudioFrame(frame(2));
    const [first, second] = FakeAudioDecoder.instances;
    playback.clearRemotePlayback(1);
    expect(first.state).toBe("closed");
    expect(second.state).toBe("configured");
    playback.handleAudioFrame(frame(1));
    expect(FakeAudioDecoder.instances).toHaveLength(3);
  });

  it("resetDownlink closes every decoder, drops every gain node and clears speaking state", () => {
    const { session, playback } = setup();
    playback.handleAudioFrame(frame(1));
    playback.handleAudioFrame(frame(2));
    playback.resetDownlink();
    expect(FakeAudioDecoder.instances.every((decoder) => decoder.state === "closed")).toBe(true);
    expect(playback.remoteGains.size).toBe(0);
    expect(session.speakingIds.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
