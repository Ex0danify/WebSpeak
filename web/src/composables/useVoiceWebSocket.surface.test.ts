import { isReactive, isRef } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
// Type-only imports: vue-tsc (G-BUILD) fails if any of these leave the public path.
import type {
  AudioInputDevice,
  AudioOutputDevice,
  AudioPermission,
  ChannelInfo,
  ChannelMember,
  ChatMessage,
  LatencyProbeResult,
  MicrophoneProcessingSettings,
  ScreenShareCaptureStats,
  ScreenShareOutputSettings,
  ScreenSharePeerStats,
  ScreenShareSignal,
  ScreenShareStream,
  ScreenShareViewer,
  ScreenShareWebRtcStats,
  ServerEvent,
  VoiceState,
} from "./useVoiceWebSocket";

type PublicTypes = [
  AudioInputDevice,
  AudioOutputDevice,
  AudioPermission,
  ChannelInfo,
  ChannelMember,
  ChatMessage,
  LatencyProbeResult,
  MicrophoneProcessingSettings,
  ScreenShareCaptureStats,
  ScreenShareOutputSettings,
  ScreenSharePeerStats,
  ScreenShareSignal,
  ScreenShareStream,
  ScreenShareViewer,
  ScreenShareWebRtcStats,
  ServerEvent,
  VoiceState,
];
export type _PublicTypesStayImportable = PublicTypes;

// Key -> kind of every value useVoiceWebSocket() returns today (Step V0.1).
const EXPECTED_SURFACE: Record<string, string> = {
  accompanimentActive: "ref",
  accompanimentErrorCode: "ref",
  accompanimentSupported: "ref",
  audioContextState: "ref",
  audioPermission: "ref",
  channels: "reactive-array",
  chatMessages: "reactive-array",
  checkSupport: "function",
  clearError: "function",
  connect: "function",
  disconnect: "function",
  ensureMicrophone: "function",
  identityMaterial: "ref",
  inputDevices: "reactive-array",
  inputVolume: "ref",
  joinScreenShare: "function",
  leaveScreenShare: "function",
  measureLatency: "function",
  members: "reactive-array",
  micLevel: "ref",
  microphoneMuted: "ref",
  microphoneProcessing: "reactive-object",
  microphoneTestActive: "ref",
  moveClient: "function",
  noiseSuppressionEnabled: "ref",
  notificationVolume: "ref",
  outputDeviceSupported: "ref",
  outputDevices: "reactive-array",
  outputMuted: "ref",
  outputVolume: "ref",
  playNotification: "function",
  pokeNotifications: "reactive-array",
  prepareInputDevices: "function",
  reconnectNow: "function",
  refreshAudioDevices: "function",
  screenShareActive: "ref",
  screenShareActiveStreamId: "ref",
  screenShareError: "ref",
  screenShareErrorCode: "ref",
  screenShareRemoteStream: "ref",
  screenShareRemoteVolume: "ref",
  screenShareStarting: "ref",
  screenShareStreams: "reactive-array",
  screenShareViewing: "ref",
  screenShareViewingStreamId: "ref",
  screenShareWebRtcStats: "reactive-object",
  selectedInputDeviceId: "ref",
  selectedOutputDeviceId: "ref",
  sendPoke: "function",
  sendPrivateMessage: "function",
  sendServerMessage: "function",
  sendTextMessage: "function",
  serverEvents: "reactive-array",
  setAway: "function",
  setInputDevice: "function",
  setInputVolume: "function",
  setMicrophoneMuted: "function",
  setNoiseSuppressionEnabled: "function",
  setNotificationVolume: "function",
  setOutputDevice: "function",
  setOutputVolume: "function",
  setVolume: "function",
  setVoxThreshold: "function",
  setWhisperActive: "function",
  setWhisperTargets: "function",
  speakingIds: "reactive-set",
  startAccompaniment: "function",
  startMicrophoneTest: "function",
  startScreenShare: "function",
  state: "reactive-object",
  stopAccompaniment: "function",
  stopMicrophoneTest: "function",
  stopScreenShare: "function",
  switchChannel: "function",
  testAudioUrl: "ref",
  toggleOutputMute: "function",
  volumes: "reactive-object",
  voxThreshold: "ref",
  whisperActive: "ref",
  whisperTargetIds: "reactive-set",
  ws: "ref",
};

function kindOf(value: unknown): string {
  if (isRef(value)) return "ref";
  if (isReactive(value)) {
    if (value instanceof Set) return "reactive-set";
    return Array.isArray(value) ? "reactive-array" : "reactive-object";
  }
  return typeof value;
}

beforeAll(() => {
  // The RNNoise worklet package extends AudioWorkletNode at import time; happy-dom has none.
  (globalThis as Record<string, unknown>).AudioWorkletNode ??= class {};
});

beforeEach(() => setActivePinia(createPinia()));

describe("useVoiceWebSocket public surface", () => {
  it("returns exactly the same keys", async () => {
    const { useVoiceWebSocket } = await import("./useVoiceWebSocket");
    expect(Object.keys(useVoiceWebSocket()).sort()).toEqual(Object.keys(EXPECTED_SURFACE).sort());
  });

  it("keeps every value the same kind (ref, reactive or function)", async () => {
    const { useVoiceWebSocket } = await import("./useVoiceWebSocket");
    const api = useVoiceWebSocket() as Record<string, unknown>;
    const actual = Object.fromEntries(Object.keys(api).sort().map((key) => [key, kindOf(api[key])]));
    expect(actual).toEqual(Object.fromEntries(Object.entries(EXPECTED_SURFACE).sort(([a], [b]) => a.localeCompare(b))));
  });

  it("exports the same runtime names from the module", async () => {
    const mod = await import("./useVoiceWebSocket");
    expect(Object.keys(mod).sort()).toEqual(["normalizeMicrophoneFailure", "useVoiceWebSocket"]);
    expect(typeof mod.normalizeMicrophoneFailure).toBe("function");
  });

  it("starts every call from empty state", async () => {
    const { useVoiceWebSocket } = await import("./useVoiceWebSocket");
    const first = useVoiceWebSocket();
    first.members.push({ id: 1, nickname: "A" });
    first.state.connected = true;
    const second = useVoiceWebSocket();
    expect(second.members).toHaveLength(0);
    expect(second.state.connected).toBe(false);
    // The state now lives in the voiceSession store (V-D1), so both calls share the reactive
    // objects and the second call's reset() is what empties them.
  });
});
