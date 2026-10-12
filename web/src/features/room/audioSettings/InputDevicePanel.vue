<template>
  <section class="mx-auto max-w-155">
    <h3 class="mb-5.25 flex items-center gap-2.25 text-xl font-bold text-fg">
      <Icon name="mic" :size="20" class="text-accent" /> {{ t("inputDevice") }}
    </h3>
    <Field :label="t('microphone')" :error="audioSettingsError ? resolveText(audioSettingsError) : undefined" class="mb-5">
      <Select
        :model-value="selectedInputDeviceId"
        :disabled="!inputDevices.length"
        @update:model-value="$emit('input-device-change', $event)"
      >
        <option value="">{{ t("defaultMicrophone") }}</option>
        <option v-for="(device, index) in inputDevices" :key="device.deviceId || `microphone-${index}`" :value="device.deviceId">
          {{ device.label || t("microphoneNumber", { index: index + 1 }) }}
        </option>
      </Select>
    </Field>
    <div class="mb-4 flex items-center justify-between gap-3 text-xs text-fg-muted">
      <span>{{ t("permission") }}</span>
      <Chip :variant="audioPermission === 'granted' ? 'success' : audioPermission === 'denied' ? 'danger' : 'neutral'">{{
        audioPermission === "granted"
          ? t("permissionGranted")
          : audioPermission === "denied"
            ? t("permissionDenied")
            : t("permissionUnknown")
      }}</Chip>
    </div>
    <div
      class="mb-4.5 flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-2 p-3 max-compact:flex-col max-compact:items-stretch max-compact:gap-2.5"
    >
      <div class="min-w-0">
        <Label class="mb-1 block">{{ t("microphoneState") }}</Label>
        <Hint class="max-w-97.5 max-compact:max-w-none">{{ microphoneMuted ? t("microphoneMutedHint") : t("microphoneActiveHint") }}</Hint>
      </div>
      <Button :pressed="microphoneMuted" class="shrink-0 max-compact:h-11 max-compact:w-full" @click="$emit('toggle-microphone')"
        ><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="16" /> {{ microphoneMuted ? t("unmuteMic") : t("muteMic") }}</Button
      >
    </div>
    <label
      v-if="isMobileViewport"
      class="mb-4.5 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3"
    >
      <span class="min-w-0">
        <strong class="block text-ui font-medium text-fg">{{ t("noiseSuppression") }}</strong>
        <small class="mt-0.5 block text-xs leading-4 text-fg-muted">{{ t("noiseSuppressionHint") }}</small>
      </span>
      <Switch
        :model-value="noiseSuppressionEnabled"
        :aria-label="t('noiseSuppression')"
        @update:model-value="$emit('set-noise-suppression', $event)"
      />
    </label>
    <template v-if="isMobileViewport">
      <div class="flex items-center justify-between gap-3">
        <Label for="input-volume">{{ t("inputVolume") }}</Label
        ><strong class="text-ui text-accent">{{ Math.round(inputVolume * 100) }}%</strong>
      </div>
      <Slider
        id="input-volume"
        :model-value="Math.round(inputVolume * 100)"
        :value-text="`${Math.round(inputVolume * 100)}%`"
        class="mb-2"
        @update:model-value="$emit('set-input-volume', $event / 100)"
      />
    </template>
    <div class="flex items-center justify-between gap-3">
      <Label for="vox-threshold">{{ t("voxThreshold") }}</Label
      ><strong class="text-ui text-accent">{{ (voxThreshold * 100).toFixed(1) }}%</strong>
    </div>
    <Slider
      id="vox-threshold"
      :model-value="Math.round(voxThreshold * 1000)"
      :min="1"
      :max="80"
      :value-text="`${(voxThreshold * 100).toFixed(1)}%`"
      class="mb-2"
      @update:model-value="$emit('set-vox-threshold', $event / 1000)"
    />
    <div class="mt-2.5 flex items-center justify-between gap-3 text-xs text-fg-muted">
      <span>{{ t("micLevel") }}</span
      ><strong class="font-semibold text-fg">{{ Math.round(micLevel * 100) }}%</strong>
    </div>
    <Meter :ref="setMeter" class="mt-1.75 mb-4.25" />
    <div class="rounded-lg border border-line bg-surface-1 p-3.75">
      <div class="flex items-center justify-between">
        <strong class="text-sm text-fg">{{ t("microphoneTest") }}</strong
        ><Button variant="outline" size="sm" @click="$emit('toggle-mic-test')">{{
          microphoneTestActive ? t("stopTest") : t("startTest")
        }}</Button>
      </div>
      <div class="mt-3 flex h-9.75 items-end justify-between gap-1 border-b border-line px-1 pb-1">
        <i
          v-for="index in 24"
          :key="index"
          :class="[
            'min-h-1 w-1.25 rounded-t-sm',
            microphoneTestActive && index <= micMeterBars ? 'animate-meter bg-success motion-reduce:animate-none' : 'bg-line',
          ]"
          :style="{ height: `${meterBarHeight(index)}px` }"
        ></i>
      </div>
      <div class="mt-1.5 flex justify-between text-2xs text-fg-muted">
        <span>{{ t("silence") }}</span
        ><span>{{ t("optimal") }}</span
        ><span>{{ t("loud") }}</span>
      </div>
      <Hint class="mt-2.5">{{ t("localMicTestHint") }}</Hint>
      <audio v-if="testAudioUrl" class="mt-2.75 block h-8.5 w-full" :src="testAudioUrl" controls :aria-label="t('microphoneTest')"></audio>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Field, Hint, Label } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Meter } from "@/shared/ui/meter";
import { Select } from "@/shared/ui/select";
import { Slider } from "@/shared/ui/slider";
import { Switch } from "@/shared/ui/switch";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { resolveText, type MaybeLocalizedText } from "@/shared/i18n/localizedText.js";
import type { AudioInputDevice, AudioPermission } from "@/features/voice";

defineProps<{
  audioSettingsError: MaybeLocalizedText;
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
}>();

defineEmits<{
  (e: "input-device-change", deviceId: string | number | undefined): void;
  (e: "toggle-microphone"): void;
  (e: "set-noise-suppression", enabled: boolean): void;
  (e: "set-input-volume", volume: number): void;
  (e: "set-vox-threshold", threshold: number): void;
  (e: "toggle-mic-test"): void;
}>();

const { t } = useI18n();
</script>
