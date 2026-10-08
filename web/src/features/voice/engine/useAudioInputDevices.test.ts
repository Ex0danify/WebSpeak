// useAudioInputDevices (Step H4.2): the device lists, the selected devices and the restart after a change,
// driven through useMicrophone, which wires the factory to the open stream.
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

// The RNNoise wasm is not loadable under happy-dom: it always falls back to the browser's own suppression.
vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  RnnoiseWorkletNode: class {},
  loadRnnoise: async () => { throw new Error("no wasm in tests"); },
}));

import { FakeMediaStream, FakeMediaStreamTrack } from "@/testSupport/browserStubs";
import type { SinkAudioContext } from "@/features/voice/voiceTypes";
import { fx, installMicrophoneFixture, openMic, setEnumerateDevices, setup } from "@/testSupport/microphoneFixture";

installMicrophoneFixture();

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
    expect(deps.setAudioNotice).toHaveBeenCalledWith("DEVICE_LIST_UNAVAILABLE");
  });

  it("does the same when enumerateDevices rejects", async () => {
    const { audio, deps, mic } = setup();
    await mic.refreshAudioDevices();
    setEnumerateDevices(async () => { throw new Error("blocked"); });
    await mic.refreshAudioDevices();
    expect(audio.inputDevices).toHaveLength(0);
    expect(deps.setAudioNotice).toHaveBeenCalledWith("DEVICE_LIST_UNAVAILABLE");
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
    expect(fx.userMedia).not.toHaveBeenCalled();

    await mic.startMicrophone();
    expect(fx.userMedia).toHaveBeenCalledTimes(1);
    audio.selectedInputDeviceId = "gone";
    await mic.refreshAudioDevices();
    await vi.waitFor(() => expect(fx.userMedia).toHaveBeenCalledTimes(2));
  });

  it("swallows a failed capture restart after an unplugged microphone", async () => {
    const { audio, mic } = await openMic();
    fx.userMedia.mockRejectedValueOnce(new Error("no device"));
    audio.selectedInputDeviceId = "gone";
    await expect(mic.refreshAudioDevices()).resolves.toBeUndefined();
    await vi.waitFor(() => expect(fx.userMedia).toHaveBeenCalledTimes(2));
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
    expect(fx.userMedia).toHaveBeenCalledTimes(1);
    expect(audio.inputDevices).toHaveLength(2);
  });

  it("only refreshes the list when a microphone is already open", async () => {
    const { audio, mic } = await openMic();
    audio.inputDevices.length = 0;
    await mic.prepareInputDevices();
    expect(fx.userMedia).toHaveBeenCalledTimes(1);
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
    expect(fx.userMedia).not.toHaveBeenCalled();
    expect(deps.stopWebRtcTransport).not.toHaveBeenCalled();
    expect(audio.inputDevices).toHaveLength(2);
  });

  it("restarts an open microphone on the new device", async () => {
    const { mic } = await openMic();
    await mic.setInputDevice("mic-b");
    expect(fx.userMedia).toHaveBeenCalledTimes(2);
    expect(fx.userMedia.mock.calls.length).toBe(2);
  });

  it("restarts WebRTC around the microphone restart, with the current connection sequence and socket", async () => {
    const order: string[] = [];
    const { session, deps, mic } = await openMic({
      webrtcActive: ref(true),
      stopWebRtcTransport: vi.fn(() => { order.push("stop"); }),
      startWebRtcTransport: vi.fn(async () => { order.push("start"); }),
    });
    fx.userMedia.mockImplementationOnce(async () => { order.push("mic"); return new FakeMediaStream([new FakeMediaStreamTrack("audio")]); });
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
    fx.userMedia.mockRejectedValueOnce(failure);
    audio.selectedInputDeviceId = "mic-a";
    window.localStorage.setItem("webspeak:input-device", "mic-a");
    await expect(mic.setInputDevice("mic-b")).rejects.toBe(failure);
    expect(audio.selectedInputDeviceId).toBe("mic-a");
    expect(window.localStorage.getItem("webspeak:input-device")).toBe("mic-a");
  });
});

