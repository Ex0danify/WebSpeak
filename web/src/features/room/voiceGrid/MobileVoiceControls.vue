<template>
  <div class="mobile-voice-controls">
    <button type="button" class="mobile-voice-toggle" :class="{ muted: microphoneMuted }" :aria-pressed="!microphoneMuted" :aria-label="microphoneMuted ? t('unmuteMic') : t('muteMic')" @click="$emit('toggleMicrophone')"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="18" /><span>{{ microphoneMuted ? t('unmuteMic') : t('muteMic') }}</span></button>
    <button type="button" class="mobile-voice-settings" :aria-label="t('audioSettings')" @click="$emit('openSettings')"><Icon name="settings" :size="17" /><span>{{ t('audioSettings') }}</span></button>
  </div>
</template>

<script setup lang="ts">
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

<style scoped>
.mobile-voice-controls { display: none; }

@media (max-width: 740px) {
  .mobile-voice-controls { display: flex; align-items: stretch; gap: 8px; margin-top: 14px; padding: 8px; background: var(--ws-surface-2); border: 1px solid var(--ws-line); border-radius: 14px; }
  .mobile-voice-toggle, .mobile-voice-settings { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; min-width: 0; padding: 0 11px; color: var(--ws-accent); background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .mobile-voice-toggle { flex: 1 1 auto; }
  .mobile-voice-toggle.muted { color: var(--ws-danger); }
  .mobile-voice-settings { flex: 0 0 auto; width: 82px; }
  .mobile-voice-settings span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

@media (max-width: 390px) {
  .mobile-voice-settings { width: 56px; padding-inline: 4px; }
  .mobile-voice-toggle { flex: 0 0 44px; padding-inline: 0; }
  .mobile-voice-toggle span { display: none; }
  .mobile-voice-settings span { display: none; }
}
</style>
