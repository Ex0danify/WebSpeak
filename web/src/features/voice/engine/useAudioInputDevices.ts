import { storeToRefs } from "pinia";
import { writeStorage } from "@/shared/services/safeStorage";
import { useVoiceAudioStore } from "../stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import type { TextParams } from "@/shared/i18n/localizedText";
import type { SinkAudioContext } from "../voiceTypes";

export interface AudioInputDevicesDeps {
  saveAudioPreferences(): Promise<void>;
  setAudioNotice(code: string, params?: TextParams): void;
  clearAudioNotice(code?: string): void;
  existingAudioCtx(): SinkAudioContext | null;
  setAudioSink(ctx: SinkAudioContext, deviceId: string): Promise<void>;
  /** The transport's flag, PCM is not sent over the WebSocket while WebRTC carries the microphone. */
  webrtcActive: { value: boolean };
  connectionSequence(): number;
  stopWebRtcTransport(): void;
  startWebRtcTransport(sequence: number, socket: WebSocket): Promise<void>;
}

/** What the device lists need from the microphone itself (late-bound, the microphone owns the stream). */
export interface AudioInputDevicesMic {
  isOpen(): boolean;
  startMicrophone(): Promise<void>;
}

/** The microphone and speaker lists, the selected devices and the restart that follows a device change.
 *  The device lists are UI state in the audio store; the stream itself stays with `useMicrophone`. */
export function useAudioInputDevices(deps: AudioInputDevicesDeps, mic: AudioInputDevicesMic) {
  const session = useSessionStore();
  const { ws } = storeToRefs(session);
  const audio = useVoiceAudioStore();
  const { selectedInputDeviceId, selectedOutputDeviceId, outputDeviceSupported } = storeToRefs(audio);
  const { inputDevices, outputDevices } = audio;
  const { webrtcActive } = deps;

  async function refreshAudioDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      inputDevices.length = 0;
      outputDevices.length = 0;
      deps.setAudioNotice("DEVICE_LIST_UNAVAILABLE");
      return;
    }
    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
      deps.clearAudioNotice("DEVICE_LIST_UNAVAILABLE");
    } catch {
      // enumerateDevices rejects when the device list is blocked (for example in a
      // locked-down iframe). Use the browser defaults and explain the limitation.
      inputDevices.length = 0;
      outputDevices.length = 0;
      deps.setAudioNotice("DEVICE_LIST_UNAVAILABLE");
      return;
    }
    const microphones = devices
      .filter((device) => device.kind === "audioinput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label, groupId: device.groupId }));
    const speakers = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label, groupId: device.groupId }));
    inputDevices.splice(0, inputDevices.length, ...microphones);
    outputDevices.splice(0, outputDevices.length, ...speakers);
    if (selectedInputDeviceId.value && !microphones.some((device) => device.deviceId === selectedInputDeviceId.value)) {
      selectedInputDeviceId.value = "";
      writeStorage("webspeak:input-device", selectedInputDeviceId.value);
      void deps.saveAudioPreferences();
      if (mic.isOpen()) void mic.startMicrophone().catch(() => undefined);
    }
    if (selectedOutputDeviceId.value && !speakers.some((device) => device.deviceId === selectedOutputDeviceId.value)) {
      selectedOutputDeviceId.value = "";
      writeStorage("webspeak:output-device", "");
      void deps.saveAudioPreferences();
      const currentAudioCtx = deps.existingAudioCtx();
      if (currentAudioCtx && outputDeviceSupported.value) void deps.setAudioSink(currentAudioCtx, "").catch(() => undefined);
    }
  }

  async function refreshInputDevices(): Promise<void> {
    await refreshAudioDevices();
  }

  async function prepareInputDevices(): Promise<void> {
    if (!mic.isOpen()) await mic.startMicrophone();
    else await refreshAudioDevices();
  }

  async function setInputDevice(deviceId: string): Promise<void> {
    const previousDeviceId = selectedInputDeviceId.value;
    const shouldRestartWebRtc = webrtcActive.value && Boolean(ws.value);
    selectedInputDeviceId.value = deviceId;
    writeStorage("webspeak:input-device", deviceId);
    void deps.saveAudioPreferences();
    try {
      if (shouldRestartWebRtc) deps.stopWebRtcTransport();
      if (mic.isOpen()) await mic.startMicrophone();
      if (shouldRestartWebRtc && ws.value) {
        deps.stopWebRtcTransport();
        await deps.startWebRtcTransport(deps.connectionSequence(), ws.value);
      }
      await refreshAudioDevices();
    } catch (error) {
      selectedInputDeviceId.value = previousDeviceId;
      writeStorage("webspeak:input-device", previousDeviceId);
      throw error;
    }
  }

  return { refreshAudioDevices, refreshInputDevices, prepareInputDevices, setInputDevice };
}
