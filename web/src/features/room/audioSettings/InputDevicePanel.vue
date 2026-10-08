<template>
  <section class="settings-section">
    <h3><Icon name="mic" :size="20" /> {{ t('inputDevice') }}</h3>
    <Field :label="t('microphone')" :error="audioSettingsError ? resolveText(audioSettingsError) : undefined" class="mb-5">
      <Select :model-value="selectedInputDeviceId" :disabled="!inputDevices.length" @update:model-value="$emit('input-device-change', $event)">
        <option value="">{{ t('defaultMicrophone') }}</option>
        <option v-for="(device, index) in inputDevices" :key="device.deviceId || `microphone-${index}`" :value="device.deviceId">{{ device.label || t('microphoneNumber', { index: index + 1 }) }}</option>
      </Select>
    </Field>
    <div class="mb-4 flex items-center justify-between gap-3 text-xs text-fg-muted">
      <span>{{ t('permission') }}</span>
      <Chip :variant="audioPermission === 'granted' ? 'success' : audioPermission === 'denied' ? 'danger' : 'neutral'">{{ audioPermission === 'granted' ? t('permissionGranted') : audioPermission === 'denied' ? t('permissionDenied') : t('permissionUnknown') }}</Chip>
    </div>
    <div class="mb-[18px] flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-2 p-3 max-[740px]:flex-col max-[740px]:items-stretch max-[740px]:gap-2.5">
      <div class="min-w-0">
        <Label class="mb-1 block">{{ t('microphoneState') }}</Label>
        <Hint class="max-w-[390px] max-[740px]:max-w-none">{{ microphoneMuted ? t('microphoneMutedHint') : t('microphoneActiveHint') }}</Hint>
      </div>
      <Button :pressed="microphoneMuted" class="shrink-0 max-[740px]:h-11 max-[740px]:w-full" @click="$emit('toggle-microphone')"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="16" /> {{ microphoneMuted ? t('unmuteMic') : t('muteMic') }}</Button>
    </div>
    <label v-if="isMobileViewport" class="mb-[18px] flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <span class="min-w-0">
        <strong class="block text-[13px] font-medium text-fg">{{ t('noiseSuppression') }}</strong>
        <small class="mt-0.5 block text-xs leading-4 text-fg-muted">{{ t('noiseSuppressionHint') }}</small>
      </span>
      <Switch :model-value="noiseSuppressionEnabled" :aria-label="t('noiseSuppression')" @update:model-value="$emit('set-noise-suppression', $event)" />
    </label>
    <template v-if="isMobileViewport">
      <div class="flex items-center justify-between gap-3"><Label for="input-volume">{{ t('inputVolume') }}</Label><strong class="text-[12.5px] text-accent">{{ Math.round(inputVolume * 100) }}%</strong></div>
      <Slider id="input-volume" :model-value="Math.round(inputVolume * 100)" :value-text="`${Math.round(inputVolume * 100)}%`" class="mb-2" @update:model-value="$emit('set-input-volume', $event / 100)" />
    </template>
      <div class="flex items-center justify-between gap-3"><Label for="vox-threshold">{{ t('voxThreshold') }}</Label><strong class="text-[12.5px] text-accent">{{ (voxThreshold * 100).toFixed(1) }}%</strong></div>
      <Slider id="vox-threshold" :model-value="Math.round(voxThreshold * 1000)" :min="1" :max="80" :value-text="`${(voxThreshold * 100).toFixed(1)}%`" class="mb-2" @update:model-value="$emit('set-vox-threshold', $event / 1000)" />
      <div class="mt-2.5 flex items-center justify-between gap-3 text-xs text-fg-muted"><span>{{ t('micLevel') }}</span><strong class="font-semibold text-fg">{{ Math.round(micLevel * 100) }}%</strong></div>
      <Meter :ref="setMeter" class="mb-[17px] mt-[7px]" />
      <div class="mic-test">
        <div class="mic-test-header"><strong>{{ t('microphoneTest') }}</strong><Button variant="outline" size="sm" @click="$emit('toggle-mic-test')">{{ microphoneTestActive ? t('stopTest') : t('startTest') }}</Button></div>
        <div class="meter"><i v-for="index in 24" :key="index" :class="{ active: microphoneTestActive && index <= micMeterBars }" :style="{ height: `${meterBarHeight(index) }px` }"></i></div>
        <div class="meter-labels"><span>{{ t('silence') }}</span><span>{{ t('optimal') }}</span><span>{{ t('loud') }}</span></div>
        <Hint class="mt-2.5">{{ t('localMicTestHint') }}</Hint>
        <audio v-if="testAudioUrl" class="test-audio" :src="testAudioUrl" controls :aria-label="t('microphoneTest')"></audio>
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

<style scoped>
/* .settings-section rules are shared with the sibling panel in the same dialog, so they are duplicated there. */
.settings-section { max-width: 620px; margin: 0 auto; }
.settings-section h3 { display: flex; align-items: center; gap: 9px; margin: 0 0 21px; color: var(--ws-fg); font-size: 16px; font-weight: 700; }
.settings-section h3 .ui-icon { color: var(--ws-accent); }
.mic-test { padding: 15px; border: 1px solid var(--ws-line); border-radius: 11px; background: var(--ws-surface-1); }
.mic-test-header { display: flex; align-items: center; justify-content: space-between; }
.mic-test-header strong { color: var(--ws-fg); font-size: 11px; }
.meter { display: flex; align-items: flex-end; justify-content: space-between; gap: 4px; height: 39px; margin-top: 12px; padding: 0 4px 4px; border-bottom: 1px solid var(--ws-line); }
.meter i { width: 5px; min-height: 4px; border-radius: 3px 3px 0 0; background: var(--ws-surface-2); }
.meter i.active { background: var(--ws-success); box-shadow: 0 0 7px color-mix(in srgb, var(--ws-success) 45%, transparent); animation: meter 1s ease-in-out infinite alternate; }
.meter-labels { display: flex; justify-content: space-between; margin-top: 6px; color: var(--ws-fg-muted); font-size: 8px; }
@keyframes meter { from { transform: scaleY(.65); } to { transform: scaleY(1); } }
.settings-body .settings-section h3 { font-size: 20px; }
.settings-body .mic-test-header strong { font-size: 13.75px; }
.settings-body .meter-labels { font-size: 10px; }
.test-audio { display: block; width: 100%; height: 34px; margin-top: 11px; }
.settings-section h3 { color: var(--ws-fg); }
.meter i { background: var(--ws-line); }
</style>
