// useMicrophone mute: the local state, the WebRTC tracks and the gateway sync, with the same stubs as useMicrophone.test.ts.
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

// The RNNoise wasm is not loadable under happy-dom: it always falls back to the browser's own suppression.
vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  RnnoiseWorkletNode: class {},
  loadRnnoise: async () => {
    throw new Error("no wasm in tests");
  },
}));

import type { FakeMediaStreamTrack } from "@/testSupport/browserStubs";
import { installMicrophoneFixture, openMic, setup } from "@/testSupport/microphoneFixture";

installMicrophoneFixture();

describe("setMicrophoneMuted", () => {
  it("stays muted locally and rejects when the gateway refuses", async () => {
    const { audio, deps, mic } = setup();
    vi.mocked(deps.sendCommand).mockRejectedValueOnce(new Error("refused"));
    await expect(mic.setMicrophoneMuted(true)).rejects.toThrow("refused");
    expect(audio.microphoneMuted).toBe(true);
  });

  it("stores the flag, tells the gateway and persists it", async () => {
    const { audio, deps, mic } = setup();
    await mic.setMicrophoneMuted(true);
    expect(audio.microphoneMuted).toBe(true);
    expect(deps.sendCommand).toHaveBeenCalledWith("setMicrophoneMuted", { muted: true });
    expect(deps.saveAudioPreferences).toHaveBeenCalledTimes(1);
  });

  it("disables the tracks and mutes the WebRTC mix only while WebRTC carries the microphone", async () => {
    const mixGain = { gain: { value: 1 } } as unknown as GainNode;
    const webrtcActive = ref(true);
    const { audio, mic } = await openMic({ webrtcActive, webrtcMixMicGain: () => mixGain });
    audio.inputVolume = 0.7;
    const tracks = mic.getMicStream()!.getAudioTracks() as unknown as FakeMediaStreamTrack[];
    await mic.setMicrophoneMuted(true);
    expect(tracks.every((track) => !track.enabled)).toBe(true);
    expect(mixGain.gain.value).toBe(0);
    await mic.setMicrophoneMuted(false);
    expect(tracks.every((track) => track.enabled)).toBe(true);
    expect(mixGain.gain.value).toBe(0.7);
    webrtcActive.value = false;
    await mic.setMicrophoneMuted(true);
    expect(tracks.every((track) => track.enabled)).toBe(true);
  });

  it("clears the own speaking indicator when muting, not when unmuting", async () => {
    const { session, deps, mic } = setup();
    session.state.tsClientId = 12;
    await mic.setMicrophoneMuted(false);
    expect(deps.clearSpeaking).not.toHaveBeenCalled();
    await mic.setMicrophoneMuted(true);
    expect(deps.clearSpeaking).toHaveBeenCalledWith(12);
  });

  it("does not clear a speaking indicator without a client id", async () => {
    const { deps, mic } = setup();
    await mic.setMicrophoneMuted(true);
    expect(deps.clearSpeaking).not.toHaveBeenCalled();
  });
});
