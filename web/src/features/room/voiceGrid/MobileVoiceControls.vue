<template>
  <div class="mt-3.5 hidden items-stretch gap-2 rounded-lg border border-line bg-surface-2 p-2 max-compact:flex">
    <Button :variant="microphoneMuted ? 'dangerSoft' : 'tinted'" pressed-tone="none" :pressed="!microphoneMuted" class="min-w-0 flex-auto max-phone:flex-none max-phone:basis-11" :aria-label="microphoneMuted ? t('unmuteMic') : t('muteMic')" @click="$emit('toggleMicrophone')"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="18" /><span class="max-phone:hidden">{{ microphoneMuted ? t('unmuteMic') : t('muteMic') }}</span></Button>
    <Button variant="tinted" class="w-20.5 min-w-0 flex-none max-phone:w-14" :aria-label="t('audioSettings')" @click="$emit('openSettings')"><Icon name="settings" :size="17" /><span class="truncate max-phone:hidden">{{ t('audioSettings') }}</span></Button>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  microphoneMuted: boolean;
}>();

defineEmits<{
  toggleMicrophone: [];
  openSettings: [];
}>();

const { t } = useI18n();
</script>
