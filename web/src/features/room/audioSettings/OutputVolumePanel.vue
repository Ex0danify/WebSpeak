<template>
  <section class="settings-section">
    <h3><Icon name="volume" :size="20" /> {{ t('outputVolume') }}</h3>
    <Field v-if="outputDeviceSupported" :label="t('outputDevice')" class="mb-5">
      <Select :model-value="selectedOutputDeviceId" :disabled="!outputDevices.length" @update:model-value="$emit('output-device-change', $event)">
        <option value="">{{ t('defaultOutput') }}</option>
        <option v-for="(device, index) in outputDevices" :key="device.deviceId || `speaker-${index}`" :value="device.deviceId">{{ device.label || t('speakerNumber', { index: index + 1 }) }}</option>
      </Select>
    </Field>
    <p v-else class="mb-5 flex items-start gap-2 rounded-md bg-surface-0 p-3 text-[12.5px] leading-normal text-fg-muted"><Icon name="info" :size="16" class="shrink-0 text-accent" /><span>{{ t('outputDeviceUnsupported') }}</span></p>
    <template v-if="isMobileViewport">
      <div class="flex items-center justify-between gap-3"><Label for="output-volume">{{ t('speakers') }}</Label><strong class="text-[12.5px] text-accent">{{ Math.round(outputVolume * 100) }}%</strong></div>
      <Slider id="output-volume" :model-value="Math.round(outputVolume * 100)" :value-text="`${Math.round(outputVolume * 100)}%`" class="mb-2" @update:model-value="$emit('set-output-volume', $event / 100)" />
    </template>
      <div class="flex items-center justify-between gap-3"><Label for="notification-volume">{{ t('notificationVolume') }}</Label><strong class="text-[12.5px] text-accent">{{ Math.round(notificationVolume * 100) }}%</strong></div>
      <Slider id="notification-volume" :model-value="Math.round(notificationVolume * 100)" :value-text="`${Math.round(notificationVolume * 100)}%`" class="mb-2" @update:model-value="$emit('set-notification-volume', $event / 100)" />
      <div class="mt-2.5 flex items-center justify-between gap-3 text-xs text-fg-muted"><span>{{ t('audioStatus') }}</span><Chip :variant="audioStatus.variant">{{ audioStatus.label }}</Chip></div>
      <Hint v-if="microphoneError" invalid class="mt-2.5">{{ resolveText(microphoneError) }}</Hint>
      <p class="mt-2.5 flex items-start gap-2 rounded-md bg-surface-0 p-3 text-[12.5px] leading-normal text-fg-muted"><Icon name="shield" :size="16" class="shrink-0 text-accent" /><span>{{ t('audioPrivacy') }}</span></p>
    </section>
</template>

<script setup lang="ts">
import { Chip } from "@/shared/ui/chip";
import { Field, Hint, Label } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Select } from "@/shared/ui/select";
import { Slider } from "@/shared/ui/slider";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { resolveText, type MaybeLocalizedText } from "@/shared/i18n/localizedText.js";
import type { AudioOutputDevice } from "@/features/voice";

defineProps<{
  outputDeviceSupported: boolean;
  selectedOutputDeviceId: string;
  outputDevices: AudioOutputDevice[];
  isMobileViewport: boolean;
  outputVolume: number;
  notificationVolume: number;
  audioStatus: { variant: "success" | "warning" | "danger" | "neutral"; label: string };
  microphoneError: MaybeLocalizedText;
}>();

defineEmits<{
  (e: "output-device-change", deviceId: string | number | undefined): void;
  (e: "set-output-volume", volume: number): void;
  (e: "set-notification-volume", volume: number): void;
}>();

const { t } = useI18n();
</script>

<style scoped>
/* .settings-section rules are shared with the sibling panel in the same dialog, so they are duplicated there. */
.settings-section { max-width: 620px; margin: 0 auto; }
.settings-section h3 { display: flex; align-items: center; gap: 9px; margin: 0 0 21px; color: var(--ws-fg); font-size: 16px; font-weight: 700; }
.settings-section h3 .ui-icon { color: var(--ws-accent); }
.settings-body .settings-section h3 { font-size: 20px; }
.settings-section h3 { color: var(--ws-fg); }
</style>
