<template>
  <div class="demo-hero"><div><Chip variant="success" dot>{{ t('simulated') }}</Chip><h1><Icon name="volume" :size="24" /> {{ channel.name }}</h1><p>{{ t('heroLead') }}</p><small><Icon name="users" :size="14" /> {{ channel.members.length }} {{ t('demoOnline') }}</small></div><div class="demo-wave" aria-hidden="true"><i v-for="bar in bars" :key="bar" :style="{ height: `${bar}px` }"></i></div></div>
  <div class="demo-section-heading"><span>{{ t('voiceActivity') }}</span><strong>{{ t('speakingNow') }}</strong></div>
  <div class="demo-voice-grid"><article v-for="member in channel.members" :key="member.id" :class="['demo-voice-card', { speaking: speakingId === member.id }]" @click="emit('update:speakingId', member.id)"><Avatar :name="member.name" size="xl" /><strong>{{ member.name }}</strong><span class="demo-voice-status">{{ speakingId === member.id ? t('speaking') : t('connected') }}</span></article></div>
</template>

<script setup lang="ts">
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/i18n/use-i18n";
import type { DemoChannel } from "./types";

defineProps<{ channel: DemoChannel; speakingId: string }>();
const emit = defineEmits<{ "update:speakingId": [id: string] }>();
const { t } = useI18n();
const bars = [15, 31, 21, 42, 25, 50, 32, 21, 38, 27, 45, 18, 33];
</script>

<style scoped>
.demo-section-heading span { color: var(--ws-fg-muted); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.demo-hero { display: flex; align-items: center; justify-content: space-between; min-height: 190px; padding: 26px 29px; overflow: hidden; border-radius: 14px; background: linear-gradient(112deg, var(--ws-accent-soft), var(--ws-surface-0)); }
.demo-hero h1 { display: flex; align-items: center; gap: 8px; margin: 17px 0 7px; color: var(--ws-fg); font-size: 28px; font-weight: 700; letter-spacing: -.05em; }
.demo-hero p { margin: 0 0 15px; color: var(--ws-fg-muted); font-size: 12px; }
.demo-hero small { display: flex; align-items: center; gap: 6px; color: var(--ws-fg-muted); font-size: 11px; }
.demo-wave { display: flex; align-items: center; gap: 5px; height: 60px; padding-right: 22px; }
.demo-wave i { width: 4px; border-radius: 4px; background: var(--ws-accent); }
.demo-wave i:nth-child(3n) { background: var(--ws-success); }
.demo-section-heading { display: grid; gap: 5px; margin: 31px 0 15px; }
.demo-section-heading strong { color: var(--ws-fg); font-size: 21px; font-weight: 700; }
.demo-voice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(125px, 1fr)); gap: 11px; }
.demo-voice-card { display: grid; justify-items: center; gap: 7px; padding: 15px 8px; border: 1px solid var(--ws-line); border-radius: 12px; background: var(--ws-surface-1); cursor: pointer; }
.demo-voice-card strong { color: var(--ws-fg); font-size: 12px; }
.demo-voice-status { color: var(--ws-fg-muted); font-size: 10px; }
.demo-voice-card.speaking { border-color: var(--ws-success); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ws-success) 18%, transparent), 0 8px 20px color-mix(in srgb, var(--ws-success) 12%, transparent); }
.demo-voice-card.speaking .demo-voice-status { color: var(--ws-success); }
@media (max-width: 720px) {
  .demo-hero { min-height: 170px; padding: 20px; }
  .demo-wave { padding-right: 0; transform: scale(.75); transform-origin: right center; }
}
@media (max-width: 360px) {
  .demo-hero h1 { font-size: 23px; }
  .demo-hero p { font-size: 11px; }
  .demo-voice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
