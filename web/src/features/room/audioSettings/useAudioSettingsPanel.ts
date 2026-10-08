import type { MessageKey } from "@/shared/i18n/messageKeys";
import { computed, ref, watch } from "vue";
import { Meter } from "@/shared/ui/meter";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { toast as raiseToast } from "@/shared/composables/useToast.js";
import { errorText, text, type MaybeLocalizedText } from "@/shared/i18n/localizedText.js";
import { microphoneErrorText } from "@/features/voice";
import type { RoomSession } from "../roomTypes";

export interface UseAudioSettingsPanelOptions {
  session: Pick<RoomSession["session"], "state">;
  audio: Pick<
    RoomSession["audio"],
    | "microphoneMuted" | "microphoneTestActive" | "accompanimentActive" | "accompanimentErrorCode"
    | "audioContextState" | "micLevel" | "setInputDevice" | "setOutputDevice" | "startMicrophoneTest"
    | "stopMicrophoneTest" | "setMicrophoneMuted" | "prepareInputDevices" | "startAccompaniment" | "stopAccompaniment"
  >;
}

/** The Audio Configuration dialog's own open state plus the panel UI layer over
 *  useRoomSession()'s already-reactive audio state: device pickers, the mic test meter,
 *  the audio-ready status chip, and the header mic/accompaniment toggles. Does not
 *  reimplement any audio state useRoomSession() already owns. */
export function useAudioSettingsPanel(options: UseAudioSettingsPanelOptions) {
  const { state: voiceState } = options.session;
  const {
    microphoneMuted, microphoneTestActive, accompanimentActive, accompanimentErrorCode,
    audioContextState, micLevel, setInputDevice, setOutputDevice, startMicrophoneTest, stopMicrophoneTest,
    setMicrophoneMuted, prepareInputDevices, startAccompaniment, stopAccompaniment,
  } = options.audio;
  const { t } = useI18n();

  function showToast(message: string, variant: "success" | "danger" = "success") {
    raiseToast({ title: message, variant, duration: 2800 });
  }

  const settingsOpen = ref(false);
  const audioSettingsError = ref<MaybeLocalizedText>("");

  watch(settingsOpen, (open) => {
    if (open) {
      audioSettingsError.value = "";
      prepareInputDevices().catch((error: unknown) => {
        audioSettingsError.value = microphoneErrorText(error);
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
      audioSettingsError.value = microphoneErrorText(error, "micSwitchFailed");
    }
  }

  async function onOutputDeviceChange(deviceId: string | number | undefined) {
    audioSettingsError.value = "";
    try {
      await setOutputDevice(String(deviceId ?? ""));
    } catch (error: unknown) {
      audioSettingsError.value = errorText(error, text("speakerSwitchFailed"));
    }
  }

  async function toggleMicTest() {
    audioSettingsError.value = "";
    try {
      if (microphoneTestActive.value) stopMicrophoneTest();
      else await startMicrophoneTest();
    } catch (error: unknown) {
      audioSettingsError.value = microphoneErrorText(error);
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
      const messageKey: MessageKey = accompanimentErrorCode.value === "needsWebRtc"
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
