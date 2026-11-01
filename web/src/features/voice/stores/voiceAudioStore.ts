import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { readStorage } from "@/shared/services/safeStorage";
import type { AudioInputDevice, AudioOutputDevice, AudioPermission, MicrophoneProcessingSettings } from "@/features/voice/voiceTypes";

export type AccompanimentErrorCode = "" | "unsupported" | "needsWebRtc" | "gatewayDisabled" | "noAudio" | "permission" | "gateway";

function initialProcessing(): MicrophoneProcessingSettings {
  return { echoCancellation: null, noiseSuppression: null, autoGainControl: null, rnnoise: null };
}

function displayMediaSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

/** Reactive audio settings and status the UI reads. `micLevel` is deliberately not here, it is written on every 20 ms capture
 *  frame so it stays a per-call ref. Audio nodes, buffers, timers and gain maps stay out too. reset() re-reads storage and the
 *  browser. */
export const useVoiceAudioStore = defineStore("voiceAudio", () => {
  const microphoneMuted = ref(false);
  const noiseSuppressionEnabled = ref(true);
  const inputVolume = ref(1);
  const outputVolume = ref(1);
  const outputMuted = ref(false);
  const notificationVolume = ref(0.5);
  const voxThreshold = ref(0.008);
  const inputDevices = reactive<AudioInputDevice[]>([]);
  const outputDevices = reactive<AudioOutputDevice[]>([]);
  const selectedInputDeviceId = ref(readStorage("webspeak:input-device") ?? "");
  const selectedOutputDeviceId = ref(readStorage("webspeak:output-device") ?? "");
  const outputDeviceSupported = ref(false);
  const audioPermission = ref<AudioPermission>("unknown");
  const microphoneProcessing = reactive<MicrophoneProcessingSettings>(initialProcessing());
  const audioContextState = ref<AudioContextState | "unknown">("unknown");
  const microphoneTestActive = ref(false);
  const testAudioUrl = ref("");
  const volumes = reactive<Record<number, number>>({});
  /** Members muted on this client. Their slider level in `volumes` is kept, only the audible gain drops to 0. */
  const mutedMembers = reactive<Record<number, boolean>>({});
  const accompanimentActive = ref(false);
  const accompanimentSupported = ref(displayMediaSupported());
  const accompanimentErrorCode = ref<AccompanimentErrorCode>("");

  function reset(): void {
    microphoneMuted.value = false;
    noiseSuppressionEnabled.value = true;
    inputVolume.value = 1;
    outputVolume.value = 1;
    outputMuted.value = false;
    notificationVolume.value = 0.5;
    voxThreshold.value = 0.008;
    inputDevices.splice(0);
    outputDevices.splice(0);
    selectedInputDeviceId.value = readStorage("webspeak:input-device") ?? "";
    selectedOutputDeviceId.value = readStorage("webspeak:output-device") ?? "";
    outputDeviceSupported.value = false;
    audioPermission.value = "unknown";
    Object.assign(microphoneProcessing, initialProcessing());
    audioContextState.value = "unknown";
    microphoneTestActive.value = false;
    testAudioUrl.value = "";
    for (const key of Object.keys(volumes)) delete volumes[Number(key)];
    for (const key of Object.keys(mutedMembers)) delete mutedMembers[Number(key)];
    accompanimentActive.value = false;
    accompanimentSupported.value = displayMediaSupported();
    accompanimentErrorCode.value = "";
  }

  /** The gain a member is actually heard at: 0 while muted, else the slider level. */
  function memberGain(clientId: number): number {
    return mutedMembers[clientId] ? 0 : (volumes[clientId] ?? 1);
  }

  return {
    microphoneMuted,
    noiseSuppressionEnabled,
    inputVolume,
    outputVolume,
    outputMuted,
    notificationVolume,
    voxThreshold,
    inputDevices,
    outputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    outputDeviceSupported,
    audioPermission,
    microphoneProcessing,
    audioContextState,
    microphoneTestActive,
    testAudioUrl,
    volumes,
    mutedMembers,
    memberGain,
    accompanimentActive,
    accompanimentSupported,
    accompanimentErrorCode,
    reset,
  };
});
