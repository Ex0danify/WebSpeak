<template>
  <aside class="demo-actions-panel" :aria-label="t('simulationControls')"><div class="demo-panel-title"><span>{{ t('voice') }}</span><strong>{{ t('simulationControls') }}</strong></div><Button variant="outline" class="justify-start" @click="emit('toggleSpeaking')"><Icon name="mic" :size="17" /> {{ speakingId ? t('stopSpeaking') : t('simulateSpeaking') }}</Button><Button variant="outline" class="justify-start" @click="emit('poke')"><Icon name="bell" :size="17" /> {{ t('poke') }}</Button><Button variant="outline" class="justify-start" @click="emit('reconnect')"><Icon name="refresh" :size="17" /> {{ t('simulateReconnect') }}</Button><div class="demo-note"><Icon name="shield" :size="16" /><span>{{ t('demoNote') }}</span></div><Separator class="demo-user-rule" /><div class="demo-user"><Avatar name="illusia" size="md" /><div><strong>illusia</strong><small>{{ t('you') }} · {{ t('ready') }}</small></div><span class="demo-green-dot"></span></div></aside>
</template>

<script setup lang="ts">
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Separator } from "@/shared/ui/separator";
import { useI18n } from "@/shared/i18n/useI18n";

defineProps<{ speakingId: string }>();
const emit = defineEmits<{ toggleSpeaking: []; poke: []; reconnect: [] }>();
const { t } = useI18n();
</script>

<style scoped>
.demo-panel-title { display: grid; gap: 5px; margin-bottom: 20px; }
.demo-panel-title span { color: var(--ws-fg-muted); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.demo-panel-title strong { color: var(--ws-fg); font-size: 18px; }
.demo-green-dot { width: 7px; height: 7px; background: var(--ws-success); border-radius: 50%; }
.demo-actions-panel { display: flex; flex-direction: column; gap: 9px; }
.demo-note { display: flex; gap: 8px; margin-top: 10px; padding: 11px; color: var(--ws-fg-muted); background: var(--ws-surface-0); border-radius: 9px; font-size: 10px; line-height: 1.5; }
.demo-user-rule { margin-top: auto; }
.demo-user { display: flex; align-items: center; gap: 9px; margin-top: 6px; }
.demo-user div { min-width: 0; flex: 1; }
.demo-user strong, .demo-user small { display: block; }
.demo-user strong { color: var(--ws-fg); font-size: 12px; }
.demo-user small { margin-top: 4px; color: var(--ws-fg-muted); font-size: 10px; }
@media (max-width: 1080px) {
  .demo-actions-panel { grid-column: 1 / -1; min-height: 160px; }
  .demo-actions-panel .demo-panel-title { margin-bottom: 3px; }
  .demo-actions-panel > button { display: inline-flex; width: fit-content; }
  .demo-note { margin-top: 4px; }
  .demo-user-rule { margin-top: 0; }
}
@media (max-width: 720px) {
  .demo-actions-panel { margin-top: 12px; }
}
</style>
