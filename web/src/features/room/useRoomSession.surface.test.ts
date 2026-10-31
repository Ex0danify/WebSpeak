import { isReactive, isRef } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
// Type-only imports: vue-tsc fails if any of these leave the public path.
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
} from "@/features/room/useRoomSession";

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

// Group -> key -> kind of every value useRoomSession() returns. This is the contract.
const EXPECTED_SURFACE: Record<string, Record<string, string>> = {
  session: {
    clearError: "function",
    connect: "function",
    disconnect: "function",
    identityMaterial: "ref",
    measureLatency: "function",
    reconnectNow: "function",
    roomNotices: "reactive-array",
    state: "reactive-object",
    ws: "ref",
  },
  roster: {
    channels: "reactive-array",
    members: "reactive-array",
    pokeNotifications: "reactive-array",
    serverEvents: "reactive-array",
    speakingIds: "reactive-set",
    volumes: "reactive-object",
    mutedMembers: "reactive-object",
    whisperActive: "ref",
    whisperTargetIds: "reactive-set",
  },
  chat: {
    chatMessages: "reactive-array",
    sendPoke: "function",
    sendPrivateMessage: "function",
    sendServerMessage: "function",
    sendTextMessage: "function",
  },
  audio: {
    accompanimentActive: "ref",
    accompanimentErrorCode: "ref",
    accompanimentSupported: "ref",
    audioContextState: "ref",
    audioPermission: "ref",
    checkSupport: "function",
    ensureMicrophone: "function",
    inputDevices: "reactive-array",
    inputVolume: "ref",
    micLevel: "ref",
    microphoneMuted: "ref",
    microphoneProcessing: "reactive-object",
    microphoneTestActive: "ref",
    noiseSuppressionEnabled: "ref",
    notificationVolume: "ref",
    outputDeviceSupported: "ref",
    outputDevices: "reactive-array",
    outputMuted: "ref",
    outputVolume: "ref",
    playNotification: "function",
    prepareInputDevices: "function",
    refreshAudioDevices: "function",
    selectedInputDeviceId: "ref",
    selectedOutputDeviceId: "ref",
    setInputDevice: "function",
    setInputVolume: "function",
    setMicrophoneMuted: "function",
    setNoiseSuppressionEnabled: "function",
    setNotificationVolume: "function",
    setOutputDevice: "function",
    setOutputVolume: "function",
    setVolume: "function",
    setMemberMuted: "function",
    setVoxThreshold: "function",
    startAccompaniment: "function",
    startMicrophoneTest: "function",
    stopAccompaniment: "function",
    stopMicrophoneTest: "function",
    testAudioUrl: "ref",
    toggleOutputMute: "function",
    voxThreshold: "ref",
  },
  screenShare: {
    joinScreenShare: "function",
    leaveScreenShare: "function",
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
    startScreenShare: "function",
    stopScreenShare: "function",
  },
  actions: {
    moveClient: "function",
    setAway: "function",
    setWhisperActive: "function",
    setWhisperTargets: "function",
    switchChannel: "function",
  },
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

describe("useRoomSession public surface", () => {
  it("returns exactly the six groups and no flat keys", async () => {
    const { useRoomSession } = await import("@/features/room/useRoomSession");
    expect(Object.keys(useRoomSession()).sort()).toEqual(Object.keys(EXPECTED_SURFACE).sort());
  });

  it("each group has exactly the expected keys, each value the same kind (ref, reactive or function)", async () => {
    const { useRoomSession } = await import("@/features/room/useRoomSession");
    const api = useRoomSession() as Record<string, Record<string, unknown>>;
    const actual = Object.fromEntries(
      Object.keys(EXPECTED_SURFACE).map((group) => [
        group,
        Object.fromEntries(
          Object.keys(api[group])
            .sort()
            .map((key) => [key, kindOf(api[group][key])]),
        ),
      ]),
    );
    const expected = Object.fromEntries(
      Object.entries(EXPECTED_SURFACE).map(([group, keys]) => [
        group,
        Object.fromEntries(Object.entries(keys).sort(([a], [b]) => a.localeCompare(b))),
      ]),
    );
    expect(actual).toEqual(expected);
  });

  it("no key appears in two groups", async () => {
    const { useRoomSession } = await import("@/features/room/useRoomSession");
    const api = useRoomSession() as Record<string, Record<string, unknown>>;
    const seen = new Set<string>();
    for (const group of Object.keys(EXPECTED_SURFACE)) {
      for (const key of Object.keys(api[group])) {
        expect(seen.has(key), `${key} in two groups`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("exports the same runtime names from the module", async () => {
    const mod = await import("@/features/room/useRoomSession");
    expect(Object.keys(mod).sort()).toEqual(["normalizeMicrophoneFailure", "useRoomSession"]);
    expect(typeof mod.normalizeMicrophoneFailure).toBe("function");
  });

  it("starts every call from empty state", async () => {
    const { useRoomSession } = await import("@/features/room/useRoomSession");
    const first = useRoomSession();
    first.roster.members.push({ id: 1, nickname: "A" });
    first.session.state.connected = true;
    const second = useRoomSession();
    expect(second.roster.members).toHaveLength(0);
    expect(second.session.state.connected).toBe(false);
    // The state lives in the voiceSession store, so both calls share the reactive
    // objects and the second call's reset() is what empties them.
  });
});
