// useMicrophoneTest: the five-second record-and-play-back test, driven through useMicrophone.
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The RNNoise wasm is not loadable under happy-dom: it always falls back to the browser's own suppression.
vi.mock("@sapphi-red/web-noise-suppressor", () => ({
  RnnoiseWorkletNode: class {},
  loadRnnoise: async () => {
    throw new Error("no wasm in tests");
  },
}));

import { FakeAudioWorkletNode } from "@/testSupport/browserStubs";
import { fx, installMicrophoneFixture, setup } from "@/testSupport/microphoneFixture";

installMicrophoneFixture();

describe("microphone test", () => {
  class FakeMediaRecorder {
    static instances: FakeMediaRecorder[] = [];
    state: "inactive" | "recording" = "inactive";
    mimeType = "";
    ondataavailable: ((event: { data: { size: number } }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(readonly stream: unknown) {
      FakeMediaRecorder.instances.push(this);
    }
    start(): void {
      this.state = "recording";
    }
    stop(): void {
      this.state = "inactive";
      this.onstop?.();
    }
  }
  let created: Blob[];
  let revoked: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeMediaRecorder.instances = [];
    created = [];
    revoked = [];
    (globalThis as Record<string, unknown>).MediaRecorder = FakeMediaRecorder;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return `blob:test-${created.length}`;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
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
    fx.userMedia.mockRejectedValueOnce(new DOMException("x", "NotAllowedError"));
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
