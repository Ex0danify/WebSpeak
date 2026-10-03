// useMicrophone (Steps V4.1, V4.2): support check, constraints, device lists, capture graph and mute,
// with stores and browser stubs and no composable around it. The uplink numbers (VOX, framing, the
// buffer cap) stay pinned by hotpath.test.ts through the public API.
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// The RNNoise wasm is not loadable under happy-dom: it always falls back to the browser's own suppression.
vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  RnnoiseWorkletNode: class {},
  loadRnnoise: async () => { throw new Error("no wasm in tests"); },
}));

import { useVoiceAudioStore } from "../stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import {
  FakeAudioContext, FakeAudioWorkletNode, FakeMediaStream, FakeMediaStreamTrack, installBrowserStubs, type BrowserStubs,
} from "@/testSupport/browserStubs";
import type { SinkAudioContext } from "../voiceTypes";
import { useMicrophone, type MicrophoneDeps } from "./useMicrophone";

let stubs: BrowserStubs;
let devices: Partial<MediaDeviceInfo>[];
let userMedia: Mock<() => Promise<FakeMediaStream>>;
let ctx: FakeAudioContext;

function setup(overrides: Partial<MicrophoneDeps> = {}) {
  const audio = useVoiceAudioStore();
  const session = useSessionStore();
  audio.noiseSuppressionEnabled = false;
  const deps = {
    saveAudioPreferences: vi.fn(async () => undefined),
    setAudioNotice: vi.fn(),
    clearAudioNotice: vi.fn(),
    existingAudioCtx: vi.fn((): SinkAudioContext | null => null),
    setAudioSink: vi.fn(async () => undefined),
    getAudioCtx: vi.fn(() => ctx as unknown as SinkAudioContext),
    syncAudioContextNotice: vi.fn(),
    releaseAudioCtx: vi.fn(),
    markSpeaking: vi.fn(),
    clearSpeaking: vi.fn(),
    sendCmd: vi.fn(),
    webrtcActive: ref(false),
    micLevel: ref(0),
    webrtcMixMicGain: vi.fn((): GainNode | null => null),
    releaseAccompanimentStream: vi.fn(),
    stopWebRtcMix: vi.fn(),
    connectionSequence: vi.fn(() => 7),
    stopWebRtcTransport: vi.fn(),
    startWebRtcTransport: vi.fn(async () => undefined),
    ...overrides,
  } satisfies MicrophoneDeps;
  return { audio, session, deps, mic: useMicrophone(deps) };
}

/** A microphone that is open: `startMicrophone` ran against the fake context and stream. */
async function openMic(overrides: Partial<MicrophoneDeps> = {}) {
  const made = setup(overrides);
  await made.mic.startMicrophone();
  return made;
}

function setEnumerateDevices(fn: () => Promise<unknown>): void {
  (navigator.mediaDevices as unknown as { enumerateDevices: () => Promise<unknown> }).enumerateDevices = fn;
}

beforeEach(() => {
  setActivePinia(createPinia());
  userMedia = vi.fn(async () => new FakeMediaStream([new FakeMediaStreamTrack("audio")]));
  stubs = installBrowserStubs({ getUserMedia: () => userMedia() });
  ctx = new FakeAudioContext({ sampleRate: 48000 });
  FakeAudioWorkletNode.instances = [];
  window.localStorage.clear();
  devices = [
    { kind: "audioinput", deviceId: "mic-a", label: "Mic A", groupId: "g1" },
    { kind: "audioinput", deviceId: "mic-b", label: "Mic B", groupId: "g2" },
    { kind: "audiooutput", deviceId: "spk-a", label: "Speaker A", groupId: "g1" },
    { kind: "videoinput", deviceId: "cam", label: "Camera", groupId: "g3" },
  ];
  setEnumerateDevices(async () => devices);
});
afterEach(() => {
  stubs.restore();
  vi.restoreAllMocks();
});

describe("checkSupport", () => {
  it("is null when every API is present", () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    expect(setup().mic.checkSupport()).toBeNull();
  });

  it("names the first missing requirement, in order", () => {
    const { mic } = setup();
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    expect(mic.checkSupport()).toBe("语音功能需要 HTTPS 安全连接");
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    expect(mic.checkSupport()).toBe("当前浏览器不支持麦克风访问");
    Object.defineProperty(navigator, "mediaDevices", { value: original, configurable: true });
    const target = globalThis as unknown as Record<string, unknown>;
    const audioContext = target.AudioContext;
    delete target.AudioContext;
    expect(mic.checkSupport()).toBe("当前浏览器不支持 Web Audio 音频处理");
    target.AudioContext = audioContext;
    const decoder = target.AudioDecoder;
    delete target.AudioDecoder;
    expect(mic.checkSupport()).toBe("当前浏览器不支持音频解码，请使用最新版 Chrome 或 Edge");
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

describe("refreshAudioDevices", () => {
  it("splits the list into microphones and speakers, keeping only id, label and group", async () => {
    const { audio, deps, mic } = setup();
    await mic.refreshAudioDevices();
    expect(audio.inputDevices).toEqual([
      { deviceId: "mic-a", label: "Mic A", groupId: "g1" },
      { deviceId: "mic-b", label: "Mic B", groupId: "g2" },
    ]);
    expect(audio.outputDevices).toEqual([{ deviceId: "spk-a", label: "Speaker A", groupId: "g1" }]);
    expect(deps.clearAudioNotice).toHaveBeenCalledWith("DEVICE_LIST_UNAVAILABLE");
  });

  it("keeps the reactive arrays' identity", async () => {
    const { audio, mic } = setup();
    const inputs = audio.inputDevices;
    const outputs = audio.outputDevices;
    await mic.refreshAudioDevices();
    expect(audio.inputDevices).toBe(inputs);
    expect(audio.outputDevices).toBe(outputs);
  });

  it("empties both lists and raises the notice when enumerateDevices is missing", async () => {
    const { audio, deps, mic } = setup();
    await mic.refreshAudioDevices();
    (navigator.mediaDevices as unknown as Record<string, unknown>).enumerateDevices = undefined;
    await mic.refreshAudioDevices();
    expect(audio.inputDevices).toHaveLength(0);
    expect(audio.outputDevices).toHaveLength(0);
    expect(deps.setAudioNotice).toHaveBeenCalledWith("DEVICE_LIST_UNAVAILABLE", expect.stringContaining("无法读取音频设备列表"));
  });

  it("does the same when enumerateDevices rejects", async () => {
    const { audio, deps, mic } = setup();
    await mic.refreshAudioDevices();
    setEnumerateDevices(async () => { throw new Error("blocked"); });
    await mic.refreshAudioDevices();
    expect(audio.inputDevices).toHaveLength(0);
    expect(deps.setAudioNotice).toHaveBeenCalledWith("DEVICE_LIST_UNAVAILABLE", expect.any(String));
    expect(deps.clearAudioNotice).toHaveBeenCalledTimes(1);
  });

  it("forgets an unplugged microphone, and restarts capture only when a stream is open", async () => {
    const { audio, deps, mic } = setup();
    audio.selectedInputDeviceId = "gone";
    window.localStorage.setItem("webspeak:input-device", "gone");
    await mic.refreshAudioDevices();
    expect(audio.selectedInputDeviceId).toBe("");
    expect(window.localStorage.getItem("webspeak:input-device")).toBe("");
    expect(deps.saveAudioPreferences).toHaveBeenCalledTimes(1);
    expect(userMedia).not.toHaveBeenCalled();

    await mic.startMicrophone();
    expect(userMedia).toHaveBeenCalledTimes(1);
    audio.selectedInputDeviceId = "gone";
    await mic.refreshAudioDevices();
    await vi.waitFor(() => expect(userMedia).toHaveBeenCalledTimes(2));
  });

  it("swallows a failed capture restart after an unplugged microphone", async () => {
    const { audio, mic } = await openMic();
    userMedia.mockRejectedValueOnce(new Error("no device"));
    audio.selectedInputDeviceId = "gone";
    await expect(mic.refreshAudioDevices()).resolves.toBeUndefined();
    await vi.waitFor(() => expect(userMedia).toHaveBeenCalledTimes(2));
  });

  it("keeps a selected device that is still present", async () => {
    const { audio, deps, mic } = setup();
    audio.selectedInputDeviceId = "mic-b";
    audio.selectedOutputDeviceId = "spk-a";
    await mic.refreshAudioDevices();
    expect(audio.selectedInputDeviceId).toBe("mic-b");
    expect(audio.selectedOutputDeviceId).toBe("spk-a");
    expect(deps.saveAudioPreferences).not.toHaveBeenCalled();
  });

  it("resets an unplugged speaker to the default sink when the context exists and sinks are supported", async () => {
    const sink = {} as SinkAudioContext;
    const { audio, deps, mic } = setup({ existingAudioCtx: vi.fn(() => sink) });
    audio.selectedOutputDeviceId = "gone";
    audio.outputDeviceSupported = true;
    window.localStorage.setItem("webspeak:output-device", "gone");
    await mic.refreshAudioDevices();
    expect(audio.selectedOutputDeviceId).toBe("");
    expect(window.localStorage.getItem("webspeak:output-device")).toBe("");
    expect(deps.saveAudioPreferences).toHaveBeenCalledTimes(1);
    expect(deps.setAudioSink).toHaveBeenCalledWith(sink, "");
  });

  it("does not touch the sink without a context or without sink support", async () => {
    const withoutCtx = setup();
    withoutCtx.audio.selectedOutputDeviceId = "gone";
    withoutCtx.audio.outputDeviceSupported = true;
    await withoutCtx.mic.refreshAudioDevices();
    expect(withoutCtx.deps.setAudioSink).not.toHaveBeenCalled();

    const unsupported = setup({ existingAudioCtx: vi.fn(() => ({}) as SinkAudioContext) });
    unsupported.audio.selectedOutputDeviceId = "gone";
    unsupported.audio.outputDeviceSupported = false;
    await unsupported.mic.refreshAudioDevices();
    expect(unsupported.deps.setAudioSink).not.toHaveBeenCalled();
  });

  it("refreshInputDevices is the same refresh", async () => {
    const { audio, mic } = setup();
    await mic.refreshInputDevices();
    expect(audio.inputDevices).toHaveLength(2);
  });
});

describe("prepareInputDevices", () => {
  it("starts the microphone when none is open, which also fills the device list", async () => {
    const { audio, mic } = setup();
    await mic.prepareInputDevices();
    expect(userMedia).toHaveBeenCalledTimes(1);
    expect(audio.inputDevices).toHaveLength(2);
  });

  it("only refreshes the list when a microphone is already open", async () => {
    const { audio, mic } = await openMic();
    audio.inputDevices.length = 0;
    await mic.prepareInputDevices();
    expect(userMedia).toHaveBeenCalledTimes(1);
    expect(audio.inputDevices).toHaveLength(2);
  });
});

describe("setInputDevice", () => {
  it("stores the choice, persists it and refreshes the list without a microphone or WebRTC", async () => {
    const { audio, deps, mic } = setup();
    await mic.setInputDevice("mic-b");
    expect(audio.selectedInputDeviceId).toBe("mic-b");
    expect(window.localStorage.getItem("webspeak:input-device")).toBe("mic-b");
    expect(deps.saveAudioPreferences).toHaveBeenCalledTimes(1);
    expect(userMedia).not.toHaveBeenCalled();
    expect(deps.stopWebRtcTransport).not.toHaveBeenCalled();
    expect(audio.inputDevices).toHaveLength(2);
  });

  it("restarts an open microphone on the new device", async () => {
    const { mic } = await openMic();
    await mic.setInputDevice("mic-b");
    expect(userMedia).toHaveBeenCalledTimes(2);
    expect(userMedia.mock.calls.length).toBe(2);
  });

  it("restarts WebRTC around the microphone restart, with the current connection sequence and socket", async () => {
    const order: string[] = [];
    const { session, deps, mic } = await openMic({
      webrtcActive: ref(true),
      stopWebRtcTransport: vi.fn(() => { order.push("stop"); }),
      startWebRtcTransport: vi.fn(async () => { order.push("start"); }),
    });
    userMedia.mockImplementationOnce(async () => { order.push("mic"); return new FakeMediaStream([new FakeMediaStreamTrack("audio")]); });
    const socket = {} as WebSocket;
    session.ws = socket;
    await mic.setInputDevice("mic-b");
    expect(order).toEqual(["stop", "mic", "stop", "start"]);
    expect(deps.startWebRtcTransport).toHaveBeenCalledWith(7, socket);
  });

  it("does not restart WebRTC without a socket", async () => {
    const { deps, mic } = setup({ webrtcActive: ref(true) });
    await mic.setInputDevice("mic-b");
    expect(deps.stopWebRtcTransport).not.toHaveBeenCalled();
  });

  it("rolls the selection and storage back and rethrows when the restart fails", async () => {
    const { audio, mic } = await openMic();
    const failure = new Error("device busy");
    userMedia.mockRejectedValueOnce(failure);
    audio.selectedInputDeviceId = "mic-a";
    window.localStorage.setItem("webspeak:input-device", "mic-a");
    await expect(mic.setInputDevice("mic-b")).rejects.toBe(failure);
    expect(audio.selectedInputDeviceId).toBe("mic-a");
    expect(window.localStorage.getItem("webspeak:input-device")).toBe("mic-a");
  });
});

describe("microphone failures", () => {
  it("records a readable failure, never the raw error, and clears it on the next success", async () => {
    const { session, mic } = setup();
    userMedia.mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError"));
    await expect(mic.startMicrophone()).rejects.toBeInstanceOf(DOMException);
    expect(session.state.microphoneErrorCode).not.toBe("");
    expect(session.state.microphoneError).not.toContain("Permission denied");
    await mic.startMicrophone();
    expect(session.state.microphoneError).toBe("");
    expect(session.state.microphoneErrorCode).toBe("");
  });

  it("marks the permission denied only for NotAllowedError and SecurityError, granted on success", async () => {
    const { audio, mic } = setup();
    userMedia.mockRejectedValueOnce(new DOMException("x", "NotAllowedError"));
    await expect(mic.startMicrophone()).rejects.toBeDefined();
    expect(audio.audioPermission).toBe("denied");
    userMedia.mockRejectedValueOnce(new DOMException("x", "NotFoundError"));
    await expect(mic.startMicrophone()).rejects.toBeDefined();
    expect(audio.audioPermission).toBe("denied");
    await mic.startMicrophone();
    expect(audio.audioPermission).toBe("granted");
    audio.audioPermission = "unknown";
    userMedia.mockRejectedValueOnce(new DOMException("x", "NotFoundError"));
    await expect(mic.startMicrophone()).rejects.toBeDefined();
    expect(audio.audioPermission).toBe("unknown");
  });

  it("setMicrophoneError returns the message it stores, clearMicrophoneError empties both slots", () => {
    const { session, mic } = setup();
    const message = mic.setMicrophoneError(new DOMException("x", "NotFoundError"));
    expect(session.state.microphoneError).toBe(message);
    expect(session.state.microphoneErrorCode).not.toBe("");
    mic.clearMicrophoneError();
    expect(session.state.microphoneError).toBe("");
    expect(session.state.microphoneErrorCode).toBe("");
  });

  it("keeps the running graph when the replacement stream cannot be acquired", async () => {
    const { deps, mic } = await openMic();
    vi.clearAllMocks();
    userMedia.mockRejectedValueOnce(new Error("busy"));
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
    userMedia.mockResolvedValueOnce(new FakeMediaStream([track]));
    ctx.state = "suspended";
    const { audio, deps, mic } = setup();
    await mic.startMicrophone();
    expect(ctx.state).toBe("running");
    expect(audio.microphoneProcessing).toMatchObject({ echoCancellation: true, noiseSuppression: false, autoGainControl: null, rnnoise: false });
    const worklet = FakeAudioWorkletNode.instances.at(-1);
    expect(worklet?.name).toBe("webspeak-mic-capture");
    expect(worklet?.options).toEqual({ numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    expect(deps.syncAudioContextNotice).toHaveBeenCalledTimes(1);
    expect(mic.getMicStream()).not.toBeNull();
  });

  it("wires source -> gain -> worklet -> silent gain -> destination, with the stored input volume", async () => {
    const { audio, mic } = setup();
    audio.inputVolume = 0.4;
    await mic.startMicrophone();
    const worklet = FakeAudioWorkletNode.instances.at(-1)!;
    const [micGain, silentGain] = ctx.gains;
    expect(micGain!.gain.value).toBe(0.4);
    expect(silentGain!.gain.value).toBe(0);
    expect(micGain!.connections).toContain(worklet);
    expect(worklet.connections).toContain(silentGain);
    expect(silentGain!.connections).toContain(ctx.destination);
  });

  it("falls back to a ScriptProcessor when the worklet cannot be created", async () => {
    ctx.audioWorklet.addModule = async () => { throw new Error("blocked"); };
    const { mic } = setup();
    const scriptProcessor = vi.spyOn(ctx, "createScriptProcessor");
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
    expect(userMedia).toHaveBeenCalledTimes(1);
  });

  it("shares one start between concurrent callers, then allows a new one after it settles", async () => {
    const { mic } = setup();
    await Promise.all([mic.ensureMicrophone(), mic.ensureMicrophone()]);
    expect(userMedia).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed start so the next call tries again", async () => {
    const { mic } = setup();
    userMedia.mockRejectedValueOnce(new Error("busy"));
    await expect(mic.ensureMicrophone()).rejects.toThrow("busy");
    await mic.ensureMicrophone();
    expect(userMedia).toHaveBeenCalledTimes(2);
    expect(mic.getMicStream()).not.toBeNull();
  });
});

describe("stopMicrophone", () => {
  it("tears down in the recorded order and closes the context by default", async () => {
    const order: string[] = [];
    const { mic } = await openMic({
      releaseAccompanimentStream: vi.fn(() => { order.push("accompaniment"); }),
      stopWebRtcMix: vi.fn(() => { order.push("mix"); }),
      releaseAudioCtx: vi.fn(() => { order.push("context"); }),
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

describe("setMicrophoneMuted", () => {
  it("stores the flag, tells the gateway and persists it", async () => {
    const { audio, deps, mic } = setup();
    mic.setMicrophoneMuted(true);
    expect(audio.microphoneMuted).toBe(true);
    expect(deps.sendCmd).toHaveBeenCalledWith("setMicrophoneMuted", { muted: true });
    expect(deps.saveAudioPreferences).toHaveBeenCalledTimes(1);
  });

  it("disables the tracks and mutes the WebRTC mix only while WebRTC carries the microphone", async () => {
    const mixGain = { gain: { value: 1 } } as unknown as GainNode;
    const webrtcActive = ref(true);
    const { audio, mic } = await openMic({ webrtcActive, webrtcMixMicGain: () => mixGain });
    audio.inputVolume = 0.7;
    const tracks = mic.getMicStream()!.getAudioTracks() as unknown as FakeMediaStreamTrack[];
    mic.setMicrophoneMuted(true);
    expect(tracks.every((track) => !track.enabled)).toBe(true);
    expect(mixGain.gain.value).toBe(0);
    mic.setMicrophoneMuted(false);
    expect(tracks.every((track) => track.enabled)).toBe(true);
    expect(mixGain.gain.value).toBe(0.7);
    webrtcActive.value = false;
    mic.setMicrophoneMuted(true);
    expect(tracks.every((track) => track.enabled)).toBe(true);
  });

  it("clears the own speaking indicator when muting, not when unmuting", async () => {
    const { session, deps, mic } = setup();
    session.state.tsClientId = 12;
    mic.setMicrophoneMuted(false);
    expect(deps.clearSpeaking).not.toHaveBeenCalled();
    mic.setMicrophoneMuted(true);
    expect(deps.clearSpeaking).toHaveBeenCalledWith(12);
  });

  it("does not clear a speaking indicator without a client id", () => {
    const { deps, mic } = setup();
    mic.setMicrophoneMuted(true);
    expect(deps.clearSpeaking).not.toHaveBeenCalled();
  });
});

describe("applyMicGain and getProcessedMicStream", () => {
  it("applies the input volume to the mic gain node once a microphone is open, and never before", async () => {
    const { audio, mic } = setup();
    expect(() => mic.applyMicGain()).not.toThrow();
    await mic.startMicrophone();
    audio.inputVolume = 0.25;
    mic.applyMicGain();
    expect(ctx.gains[0]!.gain.value).toBe(0.25);
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
    expect(userMedia).not.toHaveBeenCalled();
  });

  it("restarts an open microphone with the new constraint", async () => {
    const { mic } = await openMic();
    await mic.setNoiseSuppressionEnabled(true);
    expect(userMedia).toHaveBeenCalledTimes(2);
  });

  it("restarts WebRTC around the restart when it is active and a socket exists", async () => {
    const order: string[] = [];
    const { session, deps, mic } = await openMic({
      webrtcActive: ref(true),
      stopWebRtcTransport: vi.fn(() => { order.push("stop"); }),
      startWebRtcTransport: vi.fn(async () => { order.push("start"); }),
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
    userMedia.mockRejectedValueOnce(new DOMException("x", "NotFoundError"));
    await expect(mic.setNoiseSuppressionEnabled(true)).resolves.toBeUndefined();
    expect(session.state.microphoneErrorCode).not.toBe("");
  });
});

describe("microphone test", () => {
  class FakeMediaRecorder {
    static instances: FakeMediaRecorder[] = [];
    state: "inactive" | "recording" = "inactive";
    mimeType = "";
    ondataavailable: ((event: { data: { size: number } }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(readonly stream: unknown) { FakeMediaRecorder.instances.push(this); }
    start(): void { this.state = "recording"; }
    stop(): void { this.state = "inactive"; this.onstop?.(); }
  }
  let created: Blob[];
  let revoked: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeMediaRecorder.instances = [];
    created = [];
    revoked = [];
    (globalThis as Record<string, unknown>).MediaRecorder = FakeMediaRecorder;
    URL.createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return `blob:test-${created.length}`; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url); });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).MediaRecorder;
  });

  it("opens the microphone, records that stream and stops by itself after five seconds", async () => {
    const { audio, mic } = setup();
    await mic.startMicrophoneTest();
    const recorder = FakeMediaRecorder.instances[0]!;
    expect(audio.microphoneTestActive).toBe(true);
    expect(recorder.state).toBe("recording");
    expect(recorder.stream).toBe(mic.getMicStream());
    recorder.ondataavailable?.({ data: { size: 4 } });
    vi.advanceTimersByTime(4_999);
    expect(audio.microphoneTestActive).toBe(true);
    vi.advanceTimersByTime(1);
    expect(audio.microphoneTestActive).toBe(false);
    expect(recorder.state).toBe("inactive");
    expect(audio.testAudioUrl).toBe("blob:test-1");
  });

  it("names the recording after the recorder's mime type, defaulting to audio/webm", async () => {
    const { mic } = setup();
    await mic.startMicrophoneTest();
    const recorder = FakeMediaRecorder.instances[0]!;
    recorder.ondataavailable?.({ data: { size: 1 } });
    mic.stopMicrophoneTest();
    expect(created[0]!.type).toBe("audio/webm");
    await mic.startMicrophoneTest();
    const second = FakeMediaRecorder.instances[1]!;
    second.mimeType = "audio/ogg";
    second.ondataavailable?.({ data: { size: 1 } });
    mic.stopMicrophoneTest();
    expect(created[1]!.type).toBe("audio/ogg");
  });

  it("keeps no recording when nothing was captured, and ignores empty chunks", async () => {
    const { audio, mic } = setup();
    await mic.startMicrophoneTest();
    FakeMediaRecorder.instances[0]!.ondataavailable?.({ data: { size: 0 } });
    mic.stopMicrophoneTest();
    expect(audio.testAudioUrl).toBe("");
    expect(created).toHaveLength(0);
  });

  it("revokes the previous recording when a new test starts", async () => {
    const { audio, mic } = setup();
    audio.testAudioUrl = "blob:old";
    await mic.startMicrophoneTest();
    expect(revoked).toEqual(["blob:old"]);
    expect(audio.testAudioUrl).toBe("");
  });

  it("stops the microphone when the test ends outside a room, and leaves it running inside one", async () => {
    const outside = setup();
    await outside.mic.startMicrophoneTest();
    outside.mic.stopMicrophoneTest();
    expect(outside.mic.getMicStream()).toBeNull();
    expect(outside.deps.releaseAudioCtx).toHaveBeenCalled();

    setActivePinia(createPinia());
    const inside = setup();
    inside.session.state.connected = true;
    await inside.mic.startMicrophoneTest();
    inside.mic.stopMicrophoneTest();
    expect(inside.mic.getMicStream()).not.toBeNull();
    expect(inside.deps.releaseAudioCtx).not.toHaveBeenCalled();
  });

  it("does not gate on the recorder when the browser has none, but still opens the microphone", async () => {
    delete (globalThis as Record<string, unknown>).MediaRecorder;
    const { audio, mic } = setup();
    await mic.startMicrophoneTest();
    expect(mic.getMicStream()).not.toBeNull();
    expect(audio.microphoneTestActive).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(audio.microphoneTestActive).toBe(true);
  });

  it("clears the active flag and rethrows when the microphone cannot be opened", async () => {
    const { audio, mic } = setup();
    userMedia.mockRejectedValueOnce(new DOMException("x", "NotAllowedError"));
    await expect(mic.startMicrophoneTest()).rejects.toBeInstanceOf(DOMException);
    expect(audio.microphoneTestActive).toBe(false);
  });

  it("stopping twice is harmless, and stopping cancels the five second timer", async () => {
    const { audio, mic } = setup();
    await mic.startMicrophoneTest();
    mic.stopMicrophoneTest();
    mic.stopMicrophoneTest();
    expect(FakeMediaRecorder.instances[0]!.state).toBe("inactive");
    audio.microphoneTestActive = true;
    vi.advanceTimersByTime(10_000);
    expect(audio.microphoneTestActive).toBe(true);
  });

  it("holds the uplink back while the test runs", async () => {
    const { session, deps, mic } = setup();
    const socket = { readyState: WebSocket.OPEN, bufferedAmount: 0, send: vi.fn() } as unknown as WebSocket;
    session.ws = socket;
    await mic.startMicrophoneTest();
    const worklet = FakeAudioWorkletNode.instances.at(-1)!;
    worklet.port.onmessage?.({ data: { samples: new Float32Array(960).fill(0.5), rms: 0.5 } });
    expect(socket.send).not.toHaveBeenCalled();
    expect(deps.markSpeaking).not.toHaveBeenCalled();
    mic.stopMicrophoneTest();
  });
});
