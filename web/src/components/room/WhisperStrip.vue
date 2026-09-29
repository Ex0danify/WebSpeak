<template>
  <div v-if="whisperTargetIds.size" class="whisper-strip">
    <div class="whisper-strip-copy"><strong><Icon name="users" :size="15" /> {{ t('whisperTargets') }}</strong><span>{{ whisperTargets.map((member) => member.nickname).join('、') }}</span></div>
    <button type="button" class="text-button" @click="$emit('clear-targets')">{{ t('clearWhisperTargets') }}</button>
    <button type="button" class="whisper-ptt-button" :class="{ active: whisperPttActive || whisperActive }" :aria-pressed="whisperPttActive || whisperActive" @pointerdown.prevent="$emit('ptt-down', $event)" @pointerup.prevent="$emit('ptt-up', $event)" @pointercancel.prevent="$emit('ptt-up', $event)" @lostpointercapture="$emit('ptt-up', $event)"><Icon name="mic" :size="18" /> {{ whisperPttActive || whisperActive ? t('releaseWhisper') : t('whisperHoldToTalk') }}</button>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/i18n/use-i18n.js";
import type { ChannelMember } from "@/composables/useVoiceWebSocket.js";

defineProps<{
  whisperTargetIds: Set<number>;
  whisperActive: boolean;
  whisperPttActive: boolean;
  whisperTargets: ChannelMember[];
}>();

defineEmits<{
  (e: "clear-targets"): void;
  (e: "ptt-down", event: PointerEvent): void;
  (e: "ptt-up", event: PointerEvent): void;
}>();

const { t } = useI18n();
</script>

<style scoped>
.whisper-strip { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 12px 14px; color: var(--ws-fg-muted); border: 1px solid var(--ws-line); border-radius: 10px; background: var(--ws-surface-0); }
.whisper-strip-copy { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.whisper-strip-copy strong { display: inline-flex; align-items: center; gap: 6px; color: var(--ws-accent); font-size: 12px; white-space: nowrap; }
.whisper-strip-copy span { overflow: hidden; color: var(--ws-fg-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.whisper-ptt-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 0 12px; color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; touch-action: none; user-select: none; }
.whisper-ptt-button.active { background: var(--ws-success); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ws-success) 16%, transparent); }
.text-button { padding: 0 6px; color: var(--ws-fg-muted); background: transparent; font-size: 11px; font-weight: 600; cursor: pointer; }

@media (max-width: 740px) {
  .whisper-strip { align-items: stretch; flex-wrap: wrap; gap: 8px; }
  .whisper-strip-copy { width: 100%; flex: 1 0 100%; }
  .whisper-ptt-button { flex: 1; min-height: 46px; }
  .whisper-strip > .text-button { min-height: 38px; }
}
</style>
