// useMicrophone: support check, constraints, capture graph and mute, with stores and browser stubs and no composable around it.
// Device lists are tested in useAudioInputDevices.test.ts, the mic test in useMicrophoneTest.test.ts, and the uplink numbers
// (VOX, framing, buffer cap) in hotpath.test.ts.
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

// The RNNoise wasm is not loadable under happy-dom: it always falls back to the browser's own suppression.
vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  RnnoiseWorkletNode: class {},
  loadRnnoise: async () => {
    throw new Error("no wasm in tests");
  },
}));

import { FakeAudioWorkletNode, FakeMediaStream, FakeMediaStreamTrack } from "@/testSupport/browserStubs";
import { fx, installMicrophoneFixture, openMic, setup } from "@/testSupport/microphoneFixture";

installMicrophoneFixture();

describe("checkSupport", () => {
  it("is null when every API is present", () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    expect(setup().mic.checkSupport()).toBeNull();
  });

  it("names the first missing requirement, in order", () => {
    const { mic } = setup();
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    expect(mic.checkSupport()).toEqual({ key: "voiceNeedsHttps" });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    expect(mic.checkSupport()).toEqual({ key: "microphoneUnsupported" });
    Object.defineProperty(navigator, "mediaDevices", { value: original, configurable: true });
    const target = globalThis as unknown as Record<string, unknown>;
    const audioContext = target.AudioContext;
    delete target.AudioContext;
    expect(mic.checkSupport()).toEqual({ key: "webAudioUnsupported" });
    target.AudioContext = audioContext;
    const decoder = target.AudioDecoder;
    delete target.AudioDecoder;
    expect(mic.checkSupport()).toEqual({ key: "audioDecodingUnsupported" });
    target.AudioDecoder = decoder;
  });
});

describe("microphoneConstraints", () => {
  it("asks for 48 kHz mono with echo cancellation and no AGC, following the noise suppression toggle", () => {
    const { audio, mic } = setup();
    audio.noiseSuppressionEnabled = false;
    expect(mic.microphoneConstraints()).toEqual({
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
    });
    audio.noiseSuppressionEnabled = true;
    expect(mic.microphoneConstraints().noiseSuppression).toBe(true);
  });

  it("pins the selected device exactly, and leaves the device open without a selection", () => {
    const { audio, mic } = setup();
    expect(mic.microphoneConstraints()).not.toHaveProperty("deviceId");
    audio.selectedInputDeviceId = "mic-b";
    expect(mic.microphoneConstraints().deviceId).toEqual({ exact: "mic-b" });
  });
});

describe("microphone failures", () => {
  it("records a readable failure, never the raw error, and clears it on the next success", async () => {
    const { session, mic } = setup();
    fx.userMedia.mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError"));
    await expect(mic.startMicrophone()).rejects.toBeInstanceOf(DOMException);
    expect(session.state.microphoneErrorCode).not.toBe("");
    expect(session.state.microphoneError).not.toContain("Permission denied");
    await mic.startMicrophone();
    expect(session.state.microphoneError).toBe("");
    expect(session.state.microphoneErrorCode).toBe("");
  });

  it("marks the permission denied only for NotAllowedError and SecurityError, granted on success", async () => {
    const { audio, mic } = setup();
    fx.userMedia.mockRejectedValueOnce(new DOMException("x", "NotAllowedError"));
    await expect(mic.startMicrophone()).rejects.toBeDefined();
    expect(audio.audioPermission).toBe("denied");
    fx.userMedia.mockRejectedValueOnce(new DOMException("x", "NotFoundError"));
    await expect(mic.startMicrophone()).rejects.toBeDefined();
    expect(audio.audioPermission).toBe("denied");
    await mic.startMicrophone();
    expect(audio.audioPermission).toBe("granted");
    audio.audioPermission = "unknown";
    fx.userMedia.mockRejectedValueOnce(new DOMException("x", "NotFoundError"));
    await expect(mic.startMicrophone()).rejects.toBeDefined();
    expect(audio.audioPermission).toBe("unknown");
  });

  it("falls back to the default microphone when the saved device is gone", async () => {
    const { audio, mic } = setup();
    audio.selectedInputDeviceId = "unplugged";
    fx.userMedia.mockRejectedValueOnce(new DOMException("gone", "OverconstrainedError"));
    await mic.startMicrophone();
    expect(fx.userMedia).toHaveBeenCalledTimes(2);
    expect(audio.selectedInputDeviceId).toBe("");
    expect(mic.microphoneConstraints()).not.toHaveProperty("deviceId");
    expect(mic.getMicStream()).not.toBeNull();
  });

  it("does not retry a device-less request that fails", async () => {
    const { mic } = setup();
    fx.userMedia.mockRejectedValueOnce(new DOMException("none", "NotFoundError"));
    await expect(mic.startMicrophone()).rejects.toBeDefined();
    expect(fx.userMedia).toHaveBeenCalledTimes(1);
  });

  it("setMicrophoneError returns the text it stores, clearMicrophoneError empties both slots", () => {
    const { session, mic } = setup();
    const failure = mic.setMicrophoneError(new DOMException("x", "NotFoundError"));
    expect(failure).toEqual({ key: "micFailedNotFound" });
    expect(session.state.microphoneError).toEqual(failure);
    expect(session.state.microphoneErrorCode).not.toBe("");
    mic.clearMicrophoneError();
    expect(session.state.microphoneError).toBe("");
    expect(session.state.microphoneErrorCode).toBe("");
  });

  it("keeps the running graph when the replacement stream cannot be acquired", async () => {
    const { deps, mic } = await openMic();
    vi.clearAllMocks();
    fx.userMedia.mockRejectedValueOnce(new Error("busy"));
    await expect(mic.startMicrophone()).rejects.toThrow("busy");
    expect(mic.getMicStream()).not.toBeNull();
    expect(deps.releaseAccompanimentStream).not.toHaveBeenCalled();
    expect(deps.stopWebRtcMix).not.toHaveBeenCalled();
  });
});

describe("startMicrophone", () => {
  it("resumes a suspended context, records the granted track settings and builds the capture worklet", async () => {
    const track = new FakeMediaStreamTrack("audio");
    track.getSettings = () => ({ echoCancellation: true, noiseSuppression: false, autoGainControl: "n/a" });
    fx.userMedia.mockResolvedValueOnce(new FakeMediaStream([track]));
    fx.ctx.state = "suspended";
    const { audio, deps, mic } = setup();
    await mic.startMicrophone();
    expect(fx.ctx.state).toBe("running");
    expect(audio.microphoneProcessing).toMatchObject({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: null,
      rnnoise: false,
    });
    const worklet = FakeAudioWorkletNode.instances.at(-1);
    expect(worklet?.name).toBe("webspeak-mic-capture");
    expect(worklet?.options).toEqual({ numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    expect(deps.syncAudioContextNotice).toHaveBeenCalledTimes(1);
    expect(mic.getMicStream()).not.toBeNull();
  });

  it("asks for the microphone before resuming a suspended context, so a resume that waits cannot hide the prompt", async () => {
    fx.ctx.state = "suspended";
    const order: string[] = [];
    fx.userMedia.mockImplementationOnce(async () => {
      order.push("getUserMedia");
      return new FakeMediaStream([new FakeMediaStreamTrack("audio")]);
    });
    fx.ctx.resume = async () => {
      order.push("resume");
      fx.ctx.state = "running";
    };
    await setup().mic.startMicrophone();
    expect(order).toEqual(["getUserMedia", "resume"]);
  });

  it("wires source -> gain -> worklet -> silent gain -> destination, with the stored input volume", async () => {
    const { audio, mic } = setup();
    audio.inputVolume = 0.4;
    await mic.startMicrophone();
    const worklet = FakeAudioWorkletNode.instances.at(-1)!;
    const [micGain, silentGain] = fx.ctx.gains;
    expect(micGain!.gain.value).toBe(0.4);
    expect(silentGain!.gain.value).toBe(0);
    expect(micGain!.connections).toContain(worklet);
    expect(worklet.connections).toContain(silentGain);
    expect(silentGain!.connections).toContain(fx.ctx.destination);
  });

  it("falls back to a ScriptProcessor when the worklet cannot be created", async () => {
    fx.ctx.audioWorklet.addModule = async () => {
      throw new Error("blocked");
    };
    const { mic } = setup();
    const scriptProcessor = vi.spyOn(fx.ctx, "createScriptProcessor");
    await mic.startMicrophone();
    expect(scriptProcessor).toHaveBeenCalledWith(1024, 1, 1);
  });

  it("reports the chunk RMS as micLevel, scaled by six and capped at one", async () => {
    const { deps, mic } = setup();
    await mic.startMicrophone();
    const worklet = FakeAudioWorkletNode.instances.at(-1)!;
    worklet.port.onmessage?.({ data: { samples: new Float32Array(960).fill(0.05), rms: 0.05 } });
    expect(deps.micLevel.value).toBeCloseTo(0.3);
    worklet.port.onmessage?.({ data: { samples: new Float32Array(960).fill(0.5), rms: 0.5 } });
    expect(deps.micLevel.value).toBe(1);
  });

  it("still starts when RNNoise cannot load, and reports it as off", async () => {
    const { audio, mic } = setup();
    audio.noiseSuppressionEnabled = true;
    await mic.startMicrophone();
    expect(audio.microphoneProcessing.rnnoise).toBe(false);
    expect(mic.getMicStream()).not.toBeNull();
    expect(FakeAudioWorkletNode.instances.at(-1)?.name).toBe("webspeak-mic-capture");
  });

  it("replaces the previous graph without closing the context", async () => {
    const { deps, mic } = await openMic();
    const first = mic.getMicStream()!;
    const firstWorklet = FakeAudioWorkletNode.instances.at(-1)!;
    await mic.startMicrophone();
    expect(mic.getMicStream()).not.toBe(first);
    expect(first.getTracks().every((track) => (track as unknown as FakeMediaStreamTrack).stopped)).toBe(true);
    expect(firstWorklet.disconnected).toBe(true);
    expect(deps.releaseAudioCtx).not.toHaveBeenCalled();
  });
});

describe("ensureMicrophone", () => {
  it("returns at once when a microphone is open", async () => {
    const { mic } = await openMic();
    await mic.ensureMicrophone();
    expect(fx.userMedia).toHaveBeenCalledTimes(1);
  });

  it("shares one start between concurrent callers, then allows a new one after it settles", async () => {
    const { mic } = setup();
    await Promise.all([mic.ensureMicrophone(), mic.ensureMicrophone()]);
    expect(fx.userMedia).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed start so the next call tries again", async () => {
    const { mic } = setup();
    fx.userMedia.mockRejectedValueOnce(new Error("busy"));
    await expect(mic.ensureMicrophone()).rejects.toThrow("busy");
    await mic.ensureMicrophone();
    expect(fx.userMedia).toHaveBeenCalledTimes(2);
    expect(mic.getMicStream()).not.toBeNull();
  });
});

describe("stopMicrophone", () => {
  it("tears down in the recorded order and closes the context by default", async () => {
    const order: string[] = [];
    const { mic } = await openMic({
      releaseAccompanimentStream: vi.fn(() => {
        order.push("accompaniment");
      }),
      stopWebRtcMix: vi.fn(() => {
        order.push("mix");
      }),
      releaseAudioCtx: vi.fn(() => {
        order.push("context");
      }),
    });
    const stream = mic.getMicStream()!;
    const worklet = FakeAudioWorkletNode.instances.at(-1)!;
    order.length = 0; // the start itself stops the previous (empty) graph without the context
    mic.stopMicrophone();
    expect(order).toEqual(["accompaniment", "mix", "context"]);
    expect(worklet.disconnected).toBe(true);
    expect(stream.getTracks().every((track) => (track as unknown as FakeMediaStreamTrack).stopped)).toBe(true);
    expect(mic.getMicStream()).toBeNull();
  });

  it("keeps the context when asked to", async () => {
    const { deps, mic } = await openMic();
    mic.stopMicrophone(false);
    expect(deps.releaseAudioCtx).not.toHaveBeenCalled();
    expect(mic.getMicStream()).toBeNull();
  });

  it("zeroes the level, and a stopped capture graph no longer reports one", async () => {
    const { deps, mic } = await openMic();
    deps.micLevel.value = 0.8;
    mic.stopCaptureGraph();
    expect(deps.micLevel.value).toBe(0);
    expect(mic.getMicStream()).not.toBeNull();
  });
});

describe("applyMicGain and getProcessedMicStream", () => {
  it("applies the input volume to the mic gain node once a microphone is open, and never before", async () => {
    const { audio, mic } = setup();
    expect(() => mic.applyMicGain()).not.toThrow();
    await mic.startMicrophone();
    audio.inputVolume = 0.25;
    mic.applyMicGain();
    expect(fx.ctx.gains[0]!.gain.value).toBe(0.25);
  });

  it("is the processed destination's stream while the graph exists, the raw stream otherwise", async () => {
    const { mic } = setup();
    expect(mic.getProcessedMicStream()).toBeNull();
    await mic.startMicrophone();
    expect(mic.getProcessedMicStream()).not.toBe(mic.getMicStream());
    mic.stopMicrophone();
    expect(mic.getProcessedMicStream()).toBeNull();
  });
});

describe("setNoiseSuppressionEnabled", () => {
  it("does nothing when the value does not change", async () => {
    const { deps, mic } = setup();
    await mic.setNoiseSuppressionEnabled(false);
    expect(deps.saveAudioPreferences).not.toHaveBeenCalled();
  });

  it("stores and persists the choice, and leaves capture alone when no microphone is open", async () => {
    const { audio, mic } = setup();
    await mic.setNoiseSuppressionEnabled(true);
    expect(audio.noiseSuppressionEnabled).toBe(true);
    expect(fx.userMedia).not.toHaveBeenCalled();
  });

  it("restarts an open microphone with the new constraint", async () => {
    const { mic } = await openMic();
    await mic.setNoiseSuppressionEnabled(true);
    expect(fx.userMedia).toHaveBeenCalledTimes(2);
  });

  it("restarts WebRTC around the restart when it is active and a socket exists", async () => {
    const order: string[] = [];
    const { session, deps, mic } = await openMic({
      webrtcActive: ref(true),
      stopWebRtcTransport: vi.fn(() => {
        order.push("stop");
      }),
      startWebRtcTransport: vi.fn(async () => {
        order.push("start");
      }),
    });
    const socket = {} as WebSocket;
    session.ws = socket;
    order.length = 0;
    await mic.setNoiseSuppressionEnabled(true);
    expect(order).toEqual(["stop", "start"]);
    expect(deps.startWebRtcTransport).toHaveBeenCalledWith(7, socket);
  });

  it("turns a failed restart into a microphone error instead of throwing", async () => {
    const { session, mic } = await openMic();
    fx.userMedia.mockRejectedValueOnce(new DOMException("x", "NotFoundError"));
    await expect(mic.setNoiseSuppressionEnabled(true)).resolves.toBeUndefined();
    expect(session.state.microphoneErrorCode).not.toBe("");
  });
});
