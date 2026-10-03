<template>
  <div class="desktop-audio-dock" role="toolbar" :aria-label="t('desktopAudioControls')">
    <div class="desktop-audio-dock-copy"><strong>{{ t('desktopAudioControls') }}</strong><span>{{ accompanimentActive ? t('accompanimentActive') : t('desktopAudioHint') }}</span></div>
    <div class="desktop-audio-dock-actions">
      <div class="dock-hover-control">
        <Button variant="ghost" size="sm" icon-only class="size-[34px] text-fg-muted hover:bg-accent-soft hover:text-accent" :title="microphoneMuted ? t('unmuteMic') : t('muteMic')" :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')" :pressed="microphoneMuted" aria-haspopup="dialog" @click="$emit('toggle-microphone')"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" /></Button>
        <div class="dock-hover-panel dock-microphone-panel" role="dialog" :aria-label="t('microphone')">
          <div class="flex items-center justify-between gap-3"><span class="min-w-0 truncate text-[10px] text-fg-muted">{{ t('inputVolume') }}</span><strong class="shrink-0 text-[11px] text-accent">{{ Math.round(inputVolume * 100) }}%</strong></div>
          <Slider :model-value="Math.round(inputVolume * 100)" :value-text="`${Math.round(inputVolume * 100)}%`" :aria-label="t('inputVolume')" class="mt-1.5" @update:model-value="$emit('set-input-volume', $event / 100)" />
          <Separator class="my-3" />
          <label class="flex cursor-pointer items-center justify-between gap-3"><strong class="min-w-0 text-[11px] text-fg">{{ t('noiseSuppression') }}</strong><Switch :model-value="noiseSuppressionEnabled" :aria-label="t('noiseSuppression')" @update:model-value="$emit('set-noise-suppression', $event)" /></label>
        </div>
      </div>
      <div class="dock-hover-control">
        <Button variant="ghost" size="sm" icon-only class="size-[34px] text-fg-muted hover:bg-accent-soft hover:text-accent" :title="outputMuted ? t('unmuteOutput') : t('muteOutput')" :aria-label="outputMuted ? t('unmuteOutput') : t('muteOutput')" :pressed="outputMuted" aria-haspopup="dialog" @click="$emit('toggle-output-mute')"><Icon :name="outputMuted ? 'volume-off' : 'volume'" /></Button>
        <div class="dock-hover-panel dock-output-panel" role="dialog" :aria-label="t('overallVolume')">
          <div class="flex items-center justify-between gap-3"><span class="min-w-0 truncate text-[10px] text-fg-muted">{{ t('overallVolume') }}</span><strong class="shrink-0 text-[11px] text-accent">{{ Math.round(outputVolume * 100) }}%</strong></div>
          <Slider :model-value="Math.round(outputVolume * 100)" :value-text="`${Math.round(outputVolume * 100)}%`" :aria-label="t('overallVolume')" class="mt-1.5" @update:model-value="$emit('set-output-volume', $event / 100)" />
        </div>
      </div>
      <Tooltip :text="t('audioSettings')"><Button variant="ghost" size="sm" icon-only class="size-[34px] text-fg-muted hover:bg-accent-soft hover:text-accent" :aria-label="t('audioSettings')" @click="$emit('open-settings')"><Icon name="settings" /></Button></Tooltip>
      <Tooltip :text="accompanimentActive ? t('stopAccompaniment') : t('startAccompaniment')"><Button variant="ghost" size="sm" icon-only class="size-[34px] text-fg-muted hover:bg-accent-soft hover:text-accent aria-pressed:border-accent/40 aria-pressed:bg-accent-soft aria-pressed:text-accent" :aria-label="accompanimentActive ? t('stopAccompaniment') : t('startAccompaniment')" :pressed="accompanimentActive" @click="$emit('toggle-accompaniment')"><Icon name="music" /></Button></Tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
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

<style scoped>
.desktop-audio-dock { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; min-width: 0; margin-top: 12px; padding: 9px; color: var(--ws-fg-muted); background: color-mix(in srgb, var(--ws-accent) 8%, var(--ws-surface-1)); border: 1px solid var(--ws-line); border-radius: 12px; box-shadow: 0 8px 20px color-mix(in srgb, var(--ws-fg) 10%, transparent); }
.desktop-audio-dock-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.desktop-audio-dock-copy strong { overflow: hidden; color: var(--ws-fg); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.desktop-audio-dock-copy span { overflow: hidden; font-size: 10px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.desktop-audio-dock-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
@media (max-width: 740px) {
  .desktop-audio-dock { display: none; }
}
@media (min-width: 741px) {
  .desktop-audio-dock { position: absolute; z-index: 6; left: 18px; right: 18px; bottom: 18px; margin-top: 0; }
}

.dock-hover-control { position: relative; flex: 0 0 34px; }
.dock-hover-panel {
  position: absolute;
  z-index: 20;
  right: 50%;
  bottom: calc(100% + 10px);
  width: min(224px, calc(100vw - 32px));
  padding: 13px 14px;
  color: var(--ws-fg);
  background: var(--ws-surface-1);
  border: 1px solid var(--ws-line);
  border-radius: 12px;
  box-shadow: 0 15px 34px color-mix(in srgb, var(--ws-fg) 18%, transparent);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translate(50%, 6px);
  transition: opacity .16s ease, transform .16s ease, visibility .16s ease;
}
.dock-hover-panel::after { content: ""; position: absolute; right: auto; bottom: -6px; left: 50%; width: 10px; height: 10px; background: var(--ws-surface-1); border-right: 1px solid var(--ws-line); border-bottom: 1px solid var(--ws-line); transform: translateX(-50%) rotate(45deg); }
.dock-hover-control:hover .dock-hover-panel,
.dock-hover-control:focus-within .dock-hover-panel { opacity: 1; visibility: visible; pointer-events: auto; transform: translate(50%, 0); }
.dock-microphone-panel { width: min(246px, calc(100vw - 32px)); }

@media (prefers-reduced-motion: reduce) {
  .dock-hover-panel { transition-duration: .01ms; }
}
</style>
