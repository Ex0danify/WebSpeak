<template>
  <Separator class="mt-8.25" />
  <div class="mt-5.75 flex items-end justify-between gap-3 max-demo:grid max-demo:items-start"><div><span :class="demoKicker">{{ t('textChannel') }}</span><strong class="mt-1.5 block text-xl font-bold text-fg"># {{ channelName }} {{ t('chat') }}</strong></div><Segmented v-model="activeTab" :aria-label="t('chat')" class="max-demo:overflow-x-auto"><Segment v-for="tab in tabs" :key="tab.id" :value="tab.id">{{ tab.label }}</Segment></Segmented></div>
  <div class="mt-4.25 grid max-h-67.5 min-h-53.75 content-start gap-3.25 overflow-y-auto px-0.75 py-1.75"><div v-for="message in visibleMessages" :key="message.id" :class="['flex max-w-19/25 items-start gap-2.25 max-demo:max-w-15/16', message.mine && 'flex-row-reverse justify-self-end text-right']" @dblclick="emit('toggleMine', message.id)"><Avatar :name="message.author" size="md" /><div><small class="text-2xs text-fg-muted">{{ message.author }} · {{ message.time }}</small><p :class="['mt-1 px-2.75 py-2 text-xs', message.mine ? 'rounded-lg rounded-tr-sm bg-accent text-accent-fg' : 'rounded-lg rounded-tl-sm bg-surface-0 text-fg']">{{ messageText(message) }}</p></div></div><div v-if="!visibleMessages.length" class="grid min-h-42.5 place-content-center justify-items-center gap-2 text-fg-muted"><Icon name="message" :size="22" /><strong class="text-xs">{{ t('emptyChat') }}</strong></div></div>
  <form class="flex gap-2" @submit.prevent="emit('send')"><Input v-model="draft" :placeholder="t('placeholder')" :aria-label="t('placeholder')" class="flex-1" /><Tooltip :text="t('send')"><Button type="submit" icon-only :aria-label="t('send')" :disabled="!draft.trim()"><Icon name="send" :size="17" /></Button></Tooltip></form>
</template>

<script setup lang="ts">
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Segment, Segmented } from "@/shared/ui/tabs";
import { useI18n } from "@/shared/i18n/useI18n";
import { demoKicker } from "./demoPanel";
import type { DemoMessage, DemoTab } from "./demoTypes";

defineProps<{ channelName: string; tabs: { id: DemoTab; label: string }[]; visibleMessages: DemoMessage[] }>();
const activeTab = defineModel<DemoTab>("activeTab", { required: true });
const draft = defineModel<string>("draft", { required: true });
const emit = defineEmits<{ send: []; toggleMine: [id: number] }>();
const { language, t } = useI18n();

function messageText(message: DemoMessage): string { return language.value === "de" ? message.deText ?? message.enText ?? message.text : message.enText ?? message.text; }
</script>
