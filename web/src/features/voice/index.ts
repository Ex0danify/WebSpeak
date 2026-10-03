export { useAudioOutput, type AudioOutputDeps } from "./engine/useAudioOutput";
export { usePlayback, type PlaybackDeps } from "./engine/usePlayback";
export { useMicrophone, type MicrophoneDeps } from "./engine/useMicrophone";
export { useWebRtcTransport, type WebRtcTransportDeps } from "./engine/useWebRtcTransport";
export { useAudioPreferences, type AudioPreferencesDeps } from "./useAudioPreferences";
export { useVoiceAudioStore, type AccompanimentErrorCode } from "./stores/voiceAudioStore";
export { normalizeMicrophoneFailure } from "./voiceErrors";
export type {
  AudioInputDevice,
  AudioOutputDevice,
  AudioPermission,
  MicrophoneProcessingSettings,
  SinkAudioContext,
  SinkAudioElement,
} from "./voiceTypes";
