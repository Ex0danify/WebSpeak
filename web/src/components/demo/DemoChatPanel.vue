<template>
  <Separator class="demo-chat-rule" />
  <div class="demo-chat-head"><div><span>{{ t('textChannel') }}</span><strong># {{ channelName }} {{ t('chat') }}</strong></div><Segmented v-model="activeTab" :aria-label="t('chat')" class="demo-tabs"><Segment v-for="tab in tabs" :key="tab.id" :value="tab.id">{{ tab.label }}</Segment></Segmented></div>
  <div class="demo-messages"><div v-for="message in visibleMessages" :key="message.id" :class="['demo-message', { mine: message.mine }]" @dblclick="emit('toggleMine', message.id)"><Avatar :name="message.author" size="md" /><div><small>{{ message.author }} · {{ message.time }}</small><p>{{ messageText(message) }}</p></div></div><div v-if="!visibleMessages.length" class="demo-empty"><Icon name="message" :size="22" /><strong>{{ t('emptyChat') }}</strong></div></div>
  <form class="demo-composer" @submit.prevent="emit('send')"><Input v-model="draft" :placeholder="t('placeholder')" :aria-label="t('placeholder')" class="flex-1" /><Button type="submit" icon-only :aria-label="t('send')" :disabled="!draft.trim()"><Icon name="send" :size="17" /></Button></form>
</template>

<script setup lang="ts">
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Segment, Segmented } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/use-i18n";
import type { DemoMessage, DemoTab } from "./types";

defineProps<{ channelName: string; tabs: { id: DemoTab; label: string }[]; visibleMessages: DemoMessage[] }>();
const activeTab = defineModel<DemoTab>("activeTab", { required: true });
const draft = defineModel<string>("draft", { required: true });
const emit = defineEmits<{ send: []; toggleMine: [id: number] }>();
const { language, t } = useI18n();

function messageText(message: DemoMessage): string { return language.value === "zh" ? message.zhText ?? message.text : language.value === "ru" ? message.ruText ?? message.enText ?? message.text : language.value === "ja" ? message.jaText ?? message.enText ?? message.text : message.enText ?? message.text; }
</script>

<style scoped>
.demo-chat-head span { color: var(--ws-fg-muted); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.demo-chat-rule { margin-top: 33px; }
.demo-chat-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-top: 23px; }
.demo-chat-head strong { display: block; margin-top: 6px; color: var(--ws-fg); font-size: 20px; font-weight: 700; }
.demo-messages { display: grid; align-content: start; gap: 13px; min-height: 215px; max-height: 270px; margin-top: 17px; overflow-y: auto; padding: 7px 3px; }
.demo-message { display: flex; align-items: flex-start; gap: 9px; max-width: 76%; }
.demo-message.mine { justify-self: end; flex-direction: row-reverse; text-align: right; }
.demo-message small { color: var(--ws-fg-muted); font-size: 9px; }
.demo-message p { margin: 4px 0 0; padding: 8px 11px; color: var(--ws-fg); background: var(--ws-surface-0); border-radius: 4px 11px 11px 11px; font-size: 12px; }
.demo-message.mine p { color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 11px 4px 11px 11px; }
.demo-empty { display: grid; place-content: center; justify-items: center; gap: 8px; min-height: 170px; color: var(--ws-fg-muted); }
.demo-empty strong { font-size: 12px; }
.demo-composer { display: flex; gap: 8px }
@media (max-width: 720px) {
  .demo-chat-head { display: grid; align-items: start; }
  .demo-tabs { overflow-x: auto; }
  .demo-message { max-width: 94%; }
}
</style>
