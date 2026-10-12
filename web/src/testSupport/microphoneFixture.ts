// Shared fixture of the useMicrophone tests: browser stubs, a fake audio context, store and dep mocks, and
// `setup()`/`openMic()` building the composable. Call `installMicrophoneFixture()` at the top of a test file (the RNNoise
// `vi.mock` stays in the file itself since vi.mock is hoisted).
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { afterEach, beforeEach, vi, type Mock } from "vitest";
import { useVoiceAudioStore } from "@/features/voice/stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import {
  FakeAudioContext,
  FakeAudioWorkletNode,
  FakeMediaStream,
  FakeMediaStreamTrack,
  installBrowserStubs,
  type BrowserStubs,
} from "@/testSupport/browserStubs";
import type { SinkAudioContext } from "@/features/voice/voiceTypes";
import { useMicrophone, type MicrophoneDeps } from "@/features/voice/engine/useMicrophone";

export const fx: {
  stubs: BrowserStubs;
  devices: Partial<MediaDeviceInfo>[];
  userMedia: Mock<() => Promise<FakeMediaStream>>;
  ctx: FakeAudioContext;
} = {} as never;

export function setup(overrides: Partial<MicrophoneDeps> = {}) {
  const audio = useVoiceAudioStore();
  const session = useSessionStore();
  audio.noiseSuppressionEnabled = false;
  const deps = {
    saveAudioPreferences: vi.fn(async () => undefined),
    setAudioNotice: vi.fn(),
    clearAudioNotice: vi.fn(),
    existingAudioCtx: vi.fn((): SinkAudioContext | null => null),
    setAudioSink: vi.fn(async () => undefined),
    getAudioCtx: vi.fn(() => fx.ctx as unknown as SinkAudioContext),
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
export async function openMic(overrides: Partial<MicrophoneDeps> = {}) {
  const made = setup(overrides);
  await made.mic.startMicrophone();
  return made;
}

export function setEnumerateDevices(fn: () => Promise<unknown>): void {
  (navigator.mediaDevices as unknown as { enumerateDevices: () => Promise<unknown> }).enumerateDevices = fn;
}

export function installMicrophoneFixture(): void {
  beforeEach(() => {
    setActivePinia(createPinia());
    fx.userMedia = vi.fn(async () => new FakeMediaStream([new FakeMediaStreamTrack("audio")]));
    fx.stubs = installBrowserStubs({ getUserMedia: () => fx.userMedia() });
    fx.ctx = new FakeAudioContext({ sampleRate: 48000 });
    FakeAudioWorkletNode.instances = [];
    window.localStorage.clear();
    fx.devices = [
      { kind: "audioinput", deviceId: "mic-a", label: "Mic A", groupId: "g1" },
      { kind: "audioinput", deviceId: "mic-b", label: "Mic B", groupId: "g2" },
      { kind: "audiooutput", deviceId: "spk-a", label: "Speaker A", groupId: "g1" },
      { kind: "videoinput", deviceId: "cam", label: "Camera", groupId: "g3" },
    ];
    setEnumerateDevices(async () => fx.devices);
  });
  afterEach(() => {
    fx.stubs.restore();
    vi.restoreAllMocks();
  });
}
