export { useAudioOutput, type AudioOutputDeps } from "@/features/voice/engine/useAudioOutput";
export { usePlayback, type PlaybackDeps } from "@/features/voice/engine/usePlayback";
export { useMicrophone, type MicrophoneDeps } from "@/features/voice/engine/useMicrophone";
export { useWebRtcTransport, type WebRtcTransportDeps } from "@/features/voice/engine/useWebRtcTransport";
export { useAudioPreferences, type AudioPreferencesDeps } from "@/features/voice/useAudioPreferences";
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
