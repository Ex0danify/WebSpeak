export { useAudioOutput, type AudioOutputDeps } from "@/features/voice/engine/useAudioOutput";
export { usePlayback, type PlaybackDeps } from "@/features/voice/engine/usePlayback";
export { useMicrophone, type MicrophoneDeps } from "@/features/voice/engine/useMicrophone";
export type { VoiceStats, VoiceLinkStats } from "@/features/voice/engine/voiceStats";
export { useVoiceLinkStats } from "@/features/voice/engine/useVoiceLinkStats";
export { useWebRtcTransport, type WebRtcTransportDeps } from "@/features/voice/engine/useWebRtcTransport";
export type { NotificationSound } from "@/features/voice/engine/notificationSounds";
export { useAudioPreferences, type AudioPreferencesDeps } from "@/features/voice/useAudioPreferences";
export { DEFAULT_VOX_THRESHOLD, MIC_LEVEL_GAIN } from "@/features/voice/audioConstants";
export { VOX_DB_MAX, VOX_DB_MIN, dbToVox, formatVoxDb, levelToShare, releaseLevel, voxToDb } from "@/features/voice/voxScale";
export { useVoiceAudioStore, type AccompanimentErrorCode } from "@/features/voice/stores/voiceAudioStore";
export { normalizeMicrophoneFailure, microphoneErrorText } from "@/features/voice/voiceErrors";
export { translations as voiceMessages } from "@/features/voice/i18n/index.js";
export type {
  AudioInputDevice,
  AudioOutputDevice,
  AudioPermission,
  MicrophoneProcessingSettings,
  SinkAudioContext,
  SinkAudioElement,
} from "@/features/voice/voiceTypes";
