<template>
  <Dialog v-model="open" class="max-w-[47.5rem]" :title="t('audioConfiguration')" :close-label="t('close')">
    <div class="settings-body">
      <InputDevicePanel
        :audio-settings-error="audioSettingsError"
        :selected-input-device-id="selectedInputDeviceId"
        :input-devices="inputDevices"
        :audio-permission="audioPermission"
        :microphone-muted="microphoneMuted"
        :is-mobile-viewport="isMobileViewport"
        :noise-suppression-enabled="noiseSuppressionEnabled"
        :input-volume="inputVolume"
        :vox-threshold="voxThreshold"
        :mic-level="micLevel"
        :microphone-test-active="microphoneTestActive"
        :mic-meter-bars="micMeterBars"
        :meter-bar-height="meterBarHeight"
        :test-audio-url="testAudioUrl"
        :set-meter="setMeter"
        @input-device-change="$emit('input-device-change', $event)"
        @toggle-microphone="$emit('toggle-microphone')"
        @set-noise-suppression="$emit('set-noise-suppression', $event)"
        @set-input-volume="$emit('set-input-volume', $event)"
        @set-vox-threshold="$emit('set-vox-threshold', $event)"
        @toggle-mic-test="$emit('toggle-mic-test')"
      />
      <Separator class="mx-auto my-8 max-w-[620px]" />
      <OutputVolumePanel
        :output-device-supported="outputDeviceSupported"
        :selected-output-device-id="selectedOutputDeviceId"
        :output-devices="outputDevices"
        :is-mobile-viewport="isMobileViewport"
        :output-volume="outputVolume"
        :notification-volume="notificationVolume"
        :audio-status="audioStatus"
        :microphone-error="microphoneError"
        @output-device-change="$emit('output-device-change', $event)"
        @set-output-volume="$emit('set-output-volume', $event)"
        @set-notification-volume="$emit('set-notification-volume', $event)"
      />
    </div>
    <template #footer><Button @click="open = false">{{ t('done') }}</Button></template>
  </Dialog>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/i18n/use-i18n.js";
import type { AudioInputDevice, AudioOutputDevice, AudioPermission } from "../../composables/useVoiceWebSocket.js";
import InputDevicePanel from "./InputDevicePanel.vue";
import OutputVolumePanel from "./OutputVolumePanel.vue";

const open = defineModel<boolean>({ required: true });

defineProps<{
  audioSettingsError: string;
  selectedInputDeviceId: string;
  inputDevices: AudioInputDevice[];
  audioPermission: AudioPermission;
  microphoneMuted: boolean;
  isMobileViewport: boolean;
  noiseSuppressionEnabled: boolean;
  inputVolume: number;
  voxThreshold: number;
  micLevel: number;
  microphoneTestActive: boolean;
  micMeterBars: number;
  meterBarHeight: (index: number) => number;
  testAudioUrl: string;
  setMeter: (element: unknown) => void;
  outputDeviceSupported: boolean;
  selectedOutputDeviceId: string;
  outputDevices: AudioOutputDevice[];
  outputVolume: number;
  notificationVolume: number;
  audioStatus: { variant: "success" | "warning" | "danger" | "neutral"; label: string };
  microphoneError: string;
}>();

defineEmits<{
  (e: "input-device-change", deviceId: string | number | undefined): void;
  (e: "toggle-microphone"): void;
  (e: "set-noise-suppression", enabled: boolean): void;
  (e: "set-input-volume", volume: number): void;
  (e: "set-vox-threshold", threshold: number): void;
  (e: "toggle-mic-test"): void;
  (e: "output-device-change", deviceId: string | number | undefined): void;
  (e: "set-output-volume", volume: number): void;
  (e: "set-notification-volume", volume: number): void;
}>();

const { t } = useI18n();
</script>
