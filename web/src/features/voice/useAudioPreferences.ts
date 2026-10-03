import { reactive } from "vue";
import { storeToRefs } from "pinia";
import { loadLocalPreferences, saveLocalPreferences } from "@/shared/services/localPersistence.js";
import { useVoiceAudioStore } from "./stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";

/** The parts of a volume change that touch audio nodes or the gateway. They stay with the audio graph
 *  and are late-bound (V-D2): the assembler passes them in, later tracks move them next to the nodes. */
export interface AudioPreferencesDeps {
  /** Push a member's new volume to its gain node and, on WebRTC, to the gateway. */
  applyMemberVolume(clientId: number, normalized: number): void;
  /** Push `inputVolume` to the capture and WebRTC mix gain nodes. */
  applyInputVolume(): void;
  /** Push output volume and mute to the playback gains. */
  applyOutputVolume(): void;
}

/** Loading, saving and changing the stored audio preferences: volumes, VOX threshold, remembered
 *  per-member volumes. Reads and writes the audio and session stores directly. */
export function useAudioPreferences(deps: AudioPreferencesDeps) {
  const audio = useVoiceAudioStore();
  const {
    microphoneMuted, noiseSuppressionEnabled, inputVolume, outputVolume, outputMuted, notificationVolume, voxThreshold,
    selectedInputDeviceId, selectedOutputDeviceId,
  } = storeToRefs(audio);
  const { volumes } = audio;
  const { members } = useSessionStore();
  const storedVolumesByUid = reactive<Record<string, number>>({});

  async function saveAudioPreferences(): Promise<void> {
    await saveLocalPreferences({
      schemaVersion: 1,
      preferredInputDeviceId: selectedInputDeviceId.value,
      inputDeviceId: selectedInputDeviceId.value,
      microphoneMuted: microphoneMuted.value,
      noiseSuppressionEnabled: noiseSuppressionEnabled.value,
      voxThreshold: voxThreshold.value,
      inputGain: inputVolume.value,
      outputVolume: outputVolume.value,
      notificationVolume: notificationVolume.value,
      preferredOutputDeviceId: selectedOutputDeviceId.value,
      volumesByUid: { ...storedVolumesByUid },
    });
  }

  function syncKnownMemberVolumes(): void {
    for (const member of members) {
      if (!member.uid) continue;
      const saved = storedVolumesByUid[member.uid];
      if (saved !== undefined) volumes[member.id] = Math.max(0, Math.min(4, saved));
    }
  }

  const audioPreferencesReady = loadLocalPreferences().then((preferences) => {
    if (!selectedInputDeviceId.value) selectedInputDeviceId.value = preferences.preferredInputDeviceId ?? preferences.inputDeviceId ?? "";
    if (typeof preferences.microphoneMuted === "boolean") microphoneMuted.value = preferences.microphoneMuted;
    if (typeof preferences.noiseSuppressionEnabled === "boolean") noiseSuppressionEnabled.value = preferences.noiseSuppressionEnabled;
    if (typeof preferences.voxThreshold === "number") voxThreshold.value = clamp(preferences.voxThreshold, 0.001, 0.08);
    if (typeof preferences.inputGain === "number") inputVolume.value = Math.max(0, Math.min(1, preferences.inputGain));
    if (typeof preferences.outputVolume === "number") outputVolume.value = Math.max(0, Math.min(1, preferences.outputVolume));
    if (!selectedOutputDeviceId.value) selectedOutputDeviceId.value = preferences.preferredOutputDeviceId ?? "";
    if (typeof preferences.notificationVolume === "number") notificationVolume.value = clamp(preferences.notificationVolume, 0, 1);
    Object.assign(storedVolumesByUid, preferences.volumesByUid ?? {});
    syncKnownMemberVolumes();
  });

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function setVolume(clientId: number, volume: number): void {
    const normalized = Math.max(0, Math.min(4, volume));
    volumes[clientId] = normalized;
    const member = members.find((candidate) => candidate.id === clientId);
    if (member?.uid) {
      storedVolumesByUid[member.uid] = normalized;
      void saveAudioPreferences();
    }
    deps.applyMemberVolume(clientId, normalized);
  }

  function setInputVolume(volume: number): void {
    inputVolume.value = Math.max(0, Math.min(1, volume));
    deps.applyInputVolume();
    void saveAudioPreferences();
  }

  function setOutputVolume(volume: number): void {
    outputVolume.value = Math.max(0, Math.min(1, volume));
    deps.applyOutputVolume();
    void saveAudioPreferences();
  }

  function toggleOutputMute(): void {
    outputMuted.value = !outputMuted.value;
    deps.applyOutputVolume();
  }

  function setVoxThreshold(threshold: number): void {
    voxThreshold.value = clamp(threshold, 0.001, 0.08);
    void saveAudioPreferences();
  }

  function setNotificationVolume(volume: number): void {
    notificationVolume.value = clamp(volume, 0, 1);
    void saveAudioPreferences();
  }

  return {
    audioPreferencesReady,
    saveAudioPreferences,
    syncKnownMemberVolumes,
    setVolume,
    setInputVolume,
    setOutputVolume,
    toggleOutputMute,
    setVoxThreshold,
    setNotificationVolume,
  };
}
