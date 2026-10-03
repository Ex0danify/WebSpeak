<template>
  <div class="section-heading"><div><span class="section-kicker">{{ t('voiceActivity') }}</span><h2>{{ t('speakingNow') }}</h2></div><span class="section-counter">{{ t('onlineShort', { count }) }}</span></div>
</template>

<script setup lang="ts">
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  count: number;
}>();

const { t } = useI18n();
</script>

<style scoped>
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.section-heading h2 { display: flex; align-items: center; gap: 7px; margin: 6px 0 0; color: var(--ws-fg); font-size: 20px; font-weight: 700; letter-spacing: -.04em; }
.section-counter { color: var(--ws-fg-muted); font-size: 10px; }
.section-kicker { color: var(--ws-fg-muted); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
@media (max-width: 420px) { .section-counter { display: none; } }

/* Increase connected-view typography by 25% while keeping the layout compact. */
.app-shell .section-kicker, .app-shell .section-counter { font-size: 12.5px; }
.app-shell .section-heading h2 { font-size: 25px; }

@media (max-width: 740px) {
  .app-shell .section-heading h2 { font-size: 21.25px; }
}

.section-heading h2 { color: var(--ws-fg); }
.section-kicker, .section-counter { color: var(--ws-fg-muted); }

@media (max-width: 740px) {
  .section-heading { gap: 10px; }
  .section-heading h2 { font-size: 22px; }
}
</style>
