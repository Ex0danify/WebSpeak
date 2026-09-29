import { createPinia, setActivePinia } from "pinia";
import { isReactive } from "vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useVoiceAudioStore } from "./voiceAudio";

beforeAll(() => {
  // The RNNoise worklet package extends AudioWorkletNode at import time; happy-dom has none.
  (globalThis as Record<string, unknown>).AudioWorkletNode ??= class {};
});
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => localStorage.clear());

describe("useVoiceAudioStore", () => {
  it("starts with the defaults the composable had", () => {
    const a = useVoiceAudioStore();
    expect([a.microphoneMuted, a.noiseSuppressionEnabled, a.inputVolume, a.outputVolume, a.outputMuted, a.notificationVolume, a.voxThreshold]).toEqual([false, true, 1, 1, false, 0.5, 0.008]);
    expect([a.selectedInputDeviceId, a.selectedOutputDeviceId, a.audioPermission, a.audioContextState, a.testAudioUrl]).toEqual(["", "", "unknown", "unknown", ""]);
    expect(a.microphoneProcessing).toEqual({ echoCancellation: null, noiseSuppression: null, autoGainControl: null, rnnoise: null });
    expect(a.accompanimentErrorCode).toBe("");
  });

  it("reset() restores every value and keeps the reactive identities", () => {
    const a = useVoiceAudioStore();
    const { inputDevices, outputDevices, microphoneProcessing, volumes } = a;
    a.microphoneMuted = true;
    a.noiseSuppressionEnabled = false;
    a.inputVolume = 0.2;
    a.outputVolume = 0.3;
    a.outputMuted = true;
    a.notificationVolume = 0.9;
    a.voxThreshold = 0.05;
    a.inputDevices.push({ deviceId: "d", label: "Mic" } as never);
    a.outputDevices.push({ deviceId: "o", label: "Out" } as never);
    a.outputDeviceSupported = true;
    a.audioPermission = "granted";
    a.microphoneProcessing.rnnoise = true;
    a.audioContextState = "running";
    a.microphoneTestActive = true;
    a.testAudioUrl = "blob:x";
    a.volumes[5] = 2;
    a.accompanimentActive = true;
    a.accompanimentErrorCode = "noAudio";
    a.reset();
    expect(a.microphoneMuted).toBe(false);
    expect(a.noiseSuppressionEnabled).toBe(true);
    expect([a.inputVolume, a.outputVolume, a.notificationVolume, a.voxThreshold]).toEqual([1, 1, 0.5, 0.008]);
    expect(a.outputMuted).toBe(false);
    expect(a.inputDevices).toHaveLength(0);
    expect(a.outputDevices).toHaveLength(0);
    expect(a.outputDeviceSupported).toBe(false);
    expect(a.audioPermission).toBe("unknown");
    expect(a.microphoneProcessing.rnnoise).toBeNull();
    expect(a.audioContextState).toBe("unknown");
    expect(a.microphoneTestActive).toBe(false);
    expect(a.testAudioUrl).toBe("");
    expect(a.volumes).toEqual({});
    expect(a.accompanimentActive).toBe(false);
    expect(a.accompanimentErrorCode).toBe("");
    expect(a.inputDevices).toBe(inputDevices);
    expect(a.outputDevices).toBe(outputDevices);
    expect(a.microphoneProcessing).toBe(microphoneProcessing);
    expect(a.volumes).toBe(volumes);
    expect(isReactive(a.volumes)).toBe(true);
  });

  it("reset() re-reads the stored device ids", () => {
    const a = useVoiceAudioStore();
    localStorage.setItem("webspeak:input-device", "mic-1");
    localStorage.setItem("webspeak:output-device", "spk-1");
    a.reset();
    expect(a.selectedInputDeviceId).toBe("mic-1");
    expect(a.selectedOutputDeviceId).toBe("spk-1");
  });

  it("takes the stored device ids at creation", () => {
    localStorage.setItem("webspeak:input-device", "mic-2");
    setActivePinia(createPinia());
    expect(useVoiceAudioStore().selectedInputDeviceId).toBe("mic-2");
  });

  it("a second useVoiceWebSocket() call starts from default audio state", async () => {
    const { useVoiceWebSocket } = await import("../composables/useVoiceWebSocket");
    const first = useVoiceWebSocket();
    first.microphoneMuted.value = true;
    first.volumes[3] = 2;
    first.inputDevices.push({ deviceId: "d", label: "Mic" } as never);
    const second = useVoiceWebSocket();
    expect(second.microphoneMuted.value).toBe(false);
    expect(second.volumes).toEqual({});
    expect(second.inputDevices).toHaveLength(0);
  });
});
