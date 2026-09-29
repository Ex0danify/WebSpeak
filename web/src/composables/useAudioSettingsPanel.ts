import { computed, ref, watch, type Ref } from "vue";
import { Meter } from "@/components/ui/meter";
import { useI18n } from "../i18n/use-i18n.js";
import { microphoneErrorMessage } from "../lib/format.js";
import { localizeMessage } from "../lib/messages.js";
import { toast as raiseToast } from "../lib/use-toast.js";
import type { VoiceState } from "./useVoiceWebSocket.js";

export interface UseAudioSettingsPanelOptions {
  voiceState: VoiceState;
  microphoneMuted: Ref<boolean>;
  microphoneTestActive: Ref<boolean>;
  accompanimentActive: Ref<boolean>;
  accompanimentErrorCode: Ref<"" | "unsupported" | "needsWebRtc" | "noAudio" | "permission">;
  audioContextState: Ref<AudioContextState | "unknown">;
  micLevel: Ref<number>;
  setInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  startMicrophoneTest: () => Promise<void>;
  stopMicrophoneTest: () => void;
  setMicrophoneMuted: (muted: boolean) => void;
  prepareInputDevices: () => Promise<void>;
  startAccompaniment: () => Promise<void>;
  stopAccompaniment: () => Promise<void>;
}

/** The Audio Configuration dialog's own open state plus the panel UI layer over
 *  useVoiceWebSocket()'s already-reactive audio state: device pickers, the mic test meter,
 *  the audio-ready status chip, and the header mic/accompaniment toggles. Does not
 *  reimplement any audio state useVoiceWebSocket() already owns. */
export function useAudioSettingsPanel(options: UseAudioSettingsPanelOptions) {
  const {
    voiceState, microphoneMuted, microphoneTestActive, accompanimentActive, accompanimentErrorCode,
    audioContextState, micLevel, setInputDevice, setOutputDevice, startMicrophoneTest, stopMicrophoneTest,
    setMicrophoneMuted, prepareInputDevices, startAccompaniment, stopAccompaniment,
  } = options;
  const { language, t } = useI18n();

  function showToast(message: string, variant: "success" | "danger" = "success") {
    raiseToast({ title: message, variant, duration: 2800 });
  }

  function localizedMessage(message: string): string {
    return localizeMessage(message, language.value);
  }

  const settingsOpen = ref(false);
  const audioSettingsError = ref("");

  watch(settingsOpen, (open) => {
    if (open) {
      audioSettingsError.value = "";
      prepareInputDevices().catch((error: unknown) => {
        audioSettingsError.value = microphoneErrorMessage(error);
      });
    } else {
      stopMicrophoneTest();
    }
  });

  async function onInputDeviceChange(deviceId: string | number | undefined) {
    audioSettingsError.value = "";
    try {
      await setInputDevice(String(deviceId ?? ""));
    } catch (error: unknown) {
      audioSettingsError.value = microphoneErrorMessage(error, "无法切换麦克风");
    }
  }

  async function onOutputDeviceChange(deviceId: string | number | undefined) {
    audioSettingsError.value = "";
    try {
      await setOutputDevice(String(deviceId ?? ""));
    } catch (error: unknown) {
      audioSettingsError.value = localizedMessage(error instanceof Error ? error.message : "无法切换扬声器");
    }
  }

  async function toggleMicTest() {
    audioSettingsError.value = "";
    try {
      if (microphoneTestActive.value) stopMicrophoneTest();
      else await startMicrophoneTest();
    } catch (error: unknown) {
      audioSettingsError.value = microphoneErrorMessage(error);
    }
  }

  const audioStatus = computed<{ variant: "success" | "warning" | "danger" | "neutral"; label: string }>(() => {
    if (audioContextState.value === "running") return voiceState.microphoneError ? { variant: "danger", label: t("audioUnavailable") } : { variant: "success", label: t("audioReady") };
    if (audioContextState.value === "suspended") return { variant: "warning", label: t("audioSuspended") };
    return { variant: "neutral", label: t("audioUnknown") };
  });

  // The level bar is written straight to the element, so the 50 Hz level never re-renders the panel.
  const micLevelMeter = ref<InstanceType<typeof Meter> | null>(null);
  watch([micLevel, micLevelMeter], ([level, meter]) => meter?.setLevel(level), { flush: "post" });

  // Callback ref for the Meter, which lives in a child component that cannot bind the string ref.
  function setMicLevelMeter(element: unknown): void {
    micLevelMeter.value = element as InstanceType<typeof Meter> | null;
  }

  const micMeterBars = computed(() => Math.round(micLevel.value * 24));
  function meterBarHeight(index: number) {
    if (!microphoneTestActive.value) return 5;
    const intensity = Math.max(0, micLevel.value - (index / 24) * 0.65);
    return 5 + Math.round(intensity * 34);
  }

  function toggleMicrophone(): void {
    setMicrophoneMuted(!microphoneMuted.value);
    showToast(microphoneMuted.value ? t("microphoneMuted") : t("microphoneActive"));
  }

  async function toggleAccompaniment(): Promise<void> {
    try {
      if (accompanimentActive.value) {
        await stopAccompaniment();
        showToast(t("accompanimentStopped"));
        return;
      }
      await startAccompaniment();
      if (accompanimentActive.value) showToast(t("accompanimentStarted"));
    } catch {
      const messageKey = accompanimentErrorCode.value === "needsWebRtc"
        ? "accompanimentNeedsWebRtc"
        : accompanimentErrorCode.value === "noAudio"
          ? "accompanimentNoAudio"
          : accompanimentErrorCode.value === "unsupported"
            ? "accompanimentUnsupported"
            : "accompanimentPermissionDenied";
      showToast(t(messageKey));
    }
  }

  return {
    settingsOpen,
    audioSettingsError,
    onInputDeviceChange,
    onOutputDeviceChange,
    toggleMicTest,
    audioStatus,
    micLevelMeter,
    setMicLevelMeter,
    micMeterBars,
    meterBarHeight,
    toggleMicrophone,
    toggleAccompaniment,
  };
}
