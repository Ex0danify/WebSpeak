<template>
  <aside class="demo-channel-panel" :aria-label="t('channels')">
    <div class="demo-panel-title"><span>{{ t('channels') }}</span><strong>{{ selectedChannelName }}</strong></div>
    <div v-for="channel in channels" :key="channel.id" :class="['demo-channel', { active: selectedChannelId === channel.id }]">
      <Button variant="ghost" size="sm" :class="`w-full justify-start px-0 hover:bg-transparent ${selectedChannelId === channel.id ? 'text-accent' : 'text-fg-muted'}`" @click="emit('select', channel.id)"><Icon name="volume" :size="16" /><span class="min-w-0 flex-1 truncate text-left">{{ channel.name }}</span><Count>{{ channel.members.length }}</Count></Button>
      <div class="demo-channel-members"><span v-for="member in channel.members" :key="member.id"><Avatar :name="member.name" size="xs" :speaking="speakingId === member.id" :speaking-label="t('speaking')" :class="selectedChannelId === channel.id ? '[--avatar-gap:var(--ws-accent-soft)]' : ''" />{{ member.name }}</span></div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Count } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import type { DemoChannel } from "./demoTypes";

defineProps<{ channels: DemoChannel[]; selectedChannelId: string; selectedChannelName: string; speakingId: string }>();
const emit = defineEmits<{ select: [id: string] }>();
const { t } = useI18n();
</script>

<style scoped>
.demo-panel-title { display: grid; gap: 5px; margin-bottom: 20px; }
.demo-panel-title span { color: var(--ws-fg-muted); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.demo-panel-title strong { color: var(--ws-fg); font-size: 18px; }
.demo-channel { margin: 4px -8px 12px; padding: 3px 8px 9px; border-radius: 10px; }
.demo-channel.active { background: var(--ws-accent-soft); }
.demo-channel-members { display: grid; gap: 7px; padding-left: 22px; color: var(--ws-fg-muted); font-size: 11px; }
.demo-channel-members span { display: flex; align-items: center; gap: 7px; }
@media (max-width: 720px) {
  .demo-channel-panel .demo-channel:not(.active) .demo-channel-members { display: none; }
}
</style>
