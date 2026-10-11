<template>
  <div v-if="whisperTargetIds.size" class="mt-4.5 flex items-center gap-3 rounded-lg border border-line bg-surface-0 px-3.5 py-3 text-fg-muted max-compact:flex-wrap max-compact:items-stretch max-compact:gap-2">
    <div class="flex min-w-0 flex-1 items-center gap-2 max-compact:w-full max-compact:shrink-0 max-compact:grow max-compact:basis-full"><strong class="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-accent"><Icon name="users" :size="15" /> {{ t('whisperTargets') }}</strong><span class="truncate text-caption text-fg-muted">{{ list(whisperTargets.map((member) => member.nickname)) }}</span></div>
    <Button variant="soft" size="sm" @click="$emit('clear-targets')">{{ t('clearWhisperTargets') }}</Button>
    <Button :variant="whisperPttActive || whisperActive ? 'success' : 'primary'" pressed-tone="none" class="touch-none select-none max-compact:flex-1" :pressed="whisperPttActive || whisperActive" @pointerdown.prevent="$emit('ptt-down', $event)" @pointerup.prevent="$emit('ptt-up', $event)" @pointercancel.prevent="$emit('ptt-up', $event)" @lostpointercapture="$emit('ptt-up', $event)"><Icon name="mic" :size="18" /> {{ whisperPttActive || whisperActive ? t('releaseWhisper') : t('whisperHoldToTalk') }}</Button>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useFormat } from "@/shared/i18n/useFormat.js";
import type { ChannelMember } from "@/features/session";

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
const { list } = useFormat();
</script>
