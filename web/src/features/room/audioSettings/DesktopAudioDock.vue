<template>
  <div class="mt-3 flex min-w-0 flex-none items-center gap-2.25 rounded-lg border border-line bg-accent-soft p-2.25 text-fg-muted shadow-lg max-compact:hidden compact:absolute compact:right-4.5 compact:bottom-4.5 compact:left-4.5 compact:z-6 compact:mt-0" role="toolbar" :aria-label="t('desktopAudioControls')">
    <div class="flex min-w-0 flex-1 flex-col gap-0.75"><strong class="truncate text-xs text-fg">{{ t('desktopAudioControls') }}</strong><span class="truncate text-2xs leading-snug">{{ accompanimentActive ? t('accompanimentActive') : t('desktopAudioHint') }}</span></div>
    <div class="flex flex-none items-center gap-1">
      <Popover trigger="hover" side="top" :label="t('microphone')" class="w-61.5">
        <template #trigger>
          <Button variant="soft" size="sm" icon-only class="size-8.5" :title="microphoneMuted ? t('unmuteMic') : t('muteMic')" :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')" :pressed="microphoneMuted" aria-haspopup="dialog" @click="$emit('toggle-microphone')"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" /></Button>
        </template>
          <div class="flex items-center justify-between gap-3"><span class="min-w-0 truncate text-2xs text-fg-muted">{{ t('inputVolume') }}</span><strong class="shrink-0 text-caption text-accent">{{ Math.round(inputVolume * 100) }}%</strong></div>
          <Slider :model-value="Math.round(inputVolume * 100)" :value-text="`${Math.round(inputVolume * 100)}%`" :aria-label="t('inputVolume')" class="mt-1.5" @update:model-value="$emit('set-input-volume', $event / 100)" />
          <Separator class="my-3" />
          <label class="flex cursor-pointer items-center justify-between gap-3"><strong class="min-w-0 text-caption text-fg">{{ t('noiseSuppression') }}</strong><Switch :model-value="noiseSuppressionEnabled" :aria-label="t('noiseSuppression')" @update:model-value="$emit('set-noise-suppression', $event)" /></label>
      </Popover>
      <Popover trigger="hover" side="top" :label="t('overallVolume')" class="w-56">
        <template #trigger>
          <Button variant="soft" size="sm" icon-only class="size-8.5" :title="outputMuted ? t('unmuteOutput') : t('muteOutput')" :aria-label="outputMuted ? t('unmuteOutput') : t('muteOutput')" :pressed="outputMuted" aria-haspopup="dialog" @click="$emit('toggle-output-mute')"><Icon :name="outputMuted ? 'volume-off' : 'volume'" /></Button>
        </template>
          <div class="flex items-center justify-between gap-3"><span class="min-w-0 truncate text-2xs text-fg-muted">{{ t('overallVolume') }}</span><strong class="shrink-0 text-caption text-accent">{{ Math.round(outputVolume * 100) }}%</strong></div>
          <Slider :model-value="Math.round(outputVolume * 100)" :value-text="`${Math.round(outputVolume * 100)}%`" :aria-label="t('overallVolume')" class="mt-1.5" @update:model-value="$emit('set-output-volume', $event / 100)" />
      </Popover>
      <Tooltip :text="t('audioSettings')"><Button variant="soft" size="sm" icon-only class="size-8.5" :aria-label="t('audioSettings')" @click="$emit('open-settings')"><Icon name="settings" /></Button></Tooltip>
      <Tooltip :text="accompanimentActive ? t('stopAccompaniment') : t('startAccompaniment')"><Button variant="soft" size="sm" icon-only pressed-tone="accent" class="size-8.5" :aria-label="accompanimentActive ? t('stopAccompaniment') : t('startAccompaniment')" :pressed="accompanimentActive" @click="$emit('toggle-accompaniment')"><Icon name="music" /></Button></Tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Popover } from "@/shared/ui/popover";
import { Separator } from "@/shared/ui/separator";
import { Slider } from "@/shared/ui/slider";
import { Switch } from "@/shared/ui/switch";
import { Tooltip } from "@/shared/ui/tooltip";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  accompanimentActive: boolean;
  microphoneMuted: boolean;
  inputVolume: number;
  noiseSuppressionEnabled: boolean;
  outputMuted: boolean;
  outputVolume: number;
}>();

defineEmits<{
  (e: "toggle-microphone"): void;
  (e: "set-input-volume", value: number): void;
  (e: "set-noise-suppression", value: boolean): void;
  (e: "toggle-output-mute"): void;
  (e: "set-output-volume", value: number): void;
  (e: "open-settings"): void;
  (e: "toggle-accompaniment"): void;
}>();

const { t } = useI18n();
</script>
