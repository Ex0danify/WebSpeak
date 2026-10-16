import { reactive } from "vue";
import { storeToRefs } from "pinia";
import { loadLocalPreferences, saveLocalPreferences } from "@/shared/services/localPersistence.js";
import { useVoiceAudioStore } from "@/features/voice/stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";

/**
 * The parts of a volume change that touch audio nodes or the gateway. They stay with the audio graph and are late-bound,
 * the assembler passes them in.
 */
export interface AudioPreferencesDeps {
  /** Push a member's new volume to its gain node and, on WebRTC, to the gateway. */
  applyMemberVolume(clientId: number, normalized: number): void;
  /** Push `inputVolume` to the capture and WebRTC mix gain nodes. */
  applyInputVolume(): void;
  /** Push output volume and mute to the playback gains. */
  applyOutputVolume(): void;
  /** Tell the TeamSpeak server this client is deafened or not, so other users see it. */
  syncOutputMuted(muted: boolean): Promise<void>;
}

/** Loading, saving and changing the stored audio preferences: volumes, VOX threshold, remembered
 *  per-member volumes. Reads and writes the audio and session stores directly. */
export function useAudioPreferences(deps: AudioPreferencesDeps) {
  const audio = useVoiceAudioStore();
  const {
    microphoneMuted,
    noiseSuppressionEnabled,
    inputVolume,
    outputVolume,
    outputMuted,
    notificationVolume,
    voxThreshold,
    selectedInputDeviceId,
    selectedOutputDeviceId,
  } = storeToRefs(audio);
  const { volumes, mutedMembers } = audio;
  const { members } = useSessionStore();
  const storedVolumesByUid = reactive<Record<string, number>>({});
  const storedMutedByUid = reactive<Record<string, boolean>>({});

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
      mutedByUid: { ...storedMutedByUid },
    });
  }

  function syncKnownMemberVolumes(): void {
    for (const member of members) {
      if (!member.uid) continue;
      const saved = storedVolumesByUid[member.uid];
      if (saved !== undefined) volumes[member.id] = Math.max(0, Math.min(4, saved));
      const muted = storedMutedByUid[member.uid];
      if (muted !== undefined) mutedMembers[member.id] = muted;
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
    Object.assign(storedMutedByUid, preferences.mutedByUid ?? {});
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
    deps.applyMemberVolume(clientId, audio.memberGain(clientId));
  }

  /** Mute or unmute a member without touching their volume level. */
  function setMemberMuted(clientId: number, muted: boolean): void {
    mutedMembers[clientId] = muted;
    const member = members.find((candidate) => candidate.id === clientId);
    if (member?.uid) {
      storedMutedByUid[member.uid] = muted;
      void saveAudioPreferences();
    }
    deps.applyMemberVolume(clientId, audio.memberGain(clientId));
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

  /** The local mute takes effect at once. A refused sync leaves it on, the next connect sends the state again. */
  function toggleOutputMute(): void {
    outputMuted.value = !outputMuted.value;
    deps.applyOutputVolume();
    deps.syncOutputMuted(outputMuted.value).catch(() => undefined);
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
    setMemberMuted,
    setInputVolume,
    setOutputVolume,
    toggleOutputMute,
    setVoxThreshold,
    setNotificationVolume,
  };
}
