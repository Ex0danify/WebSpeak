export interface AudioInputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export type AudioPermission = "unknown" | "granted" | "denied";

export interface MicrophoneProcessingSettings {
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  rnnoise: boolean | null;
}

export type SinkAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};
