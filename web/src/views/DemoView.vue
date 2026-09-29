<template>
  <div class="demo-page">
    <DemoHeader />

    <Banner v-if="reconnecting" variant="warning" icon="refresh" class="demo-reconnect">
      {{ t('reconnecting') }}
      <template #actions><Button size="sm" variant="outline" @click="reconnecting = false">{{ t('restore') }}</Button></template>
    </Banner>
    <main class="demo-shell">
      <DemoChannelPanel :channels="channels" :selected-channel-id="selectedChannelId" :selected-channel-name="selectedChannel.name" :speaking-id="speakingId" @select="selectChannel" />

      <section class="demo-main">
        <DemoVoiceSection v-model:speaking-id="speakingId" :channel="selectedChannel" />
        <DemoChatPanel v-model:active-tab="activeTab" v-model:draft="draft" :channel-name="selectedChannel.name" :tabs="tabs" :visible-messages="visibleMessages" @send="sendMessage" @toggle-mine="toggleMine" />
      </section>

      <DemoActionsPanel :speaking-id="speakingId" @toggle-speaking="toggleSpeaking" @poke="poke = !poke" @reconnect="reconnecting = true" />
    </main>
    <Banner v-if="poke" variant="warning" icon="bell" :title="`msicbot ${t('pokedYou')}`" dismissible :dismiss-label="t('close')" class="demo-poke shadow-lg" @dismiss="poke = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import DemoActionsPanel from "../components/demo/DemoActionsPanel.vue";
import DemoChannelPanel from "../components/demo/DemoChannelPanel.vue";
import DemoChatPanel from "../components/demo/DemoChatPanel.vue";
import DemoHeader from "../components/demo/DemoHeader.vue";
import DemoVoiceSection from "../components/demo/DemoVoiceSection.vue";
import type { DemoChannel, DemoMessage, DemoTab } from "../components/demo/types";
import { useI18n } from "@/i18n/use-i18n";

const { t } = useI18n();
const selectedChannelId = ref("quiet");
const activeTab = ref<DemoTab>("channel");
const speakingId = ref("illusia");
const reconnecting = ref(false);
const poke = ref(false);
const draft = ref("");
const channels: DemoChannel[] = [
  { id: "quiet", name: "Quiet Zone", members: [{ id: "illusia", name: "illusia" }, { id: "msicbot", name: "msicbot" }] },
  { id: "lounge", name: "Lounge", members: [{ id: "alice", name: "Alice" }] },
  { id: "music", name: "Music room", members: [] },
];
const messages = ref<DemoMessage[]>([
  { id: 1, author: "illusia", time: "10:24", text: "", zhText: "大家好，欢迎来到 WebSpeak。", enText: "Hello everyone, welcome to WebSpeak.", mine: true },
  { id: 2, author: "msicbot", time: "10:25", text: "", zhText: "语音和文字频道都已同步。", enText: "Voice and text channels are in sync.", mine: false },
]);
const tabs = computed(() => [{ id: "channel" as const, label: t('channel') }, { id: "server" as const, label: t('server') }]);
const selectedChannel = computed(() => channels.find((channel) => channel.id === selectedChannelId.value) ?? channels[0]);
const visibleMessages = computed(() => activeTab.value === "channel" ? messages.value : []);

function selectChannel(id: string) { selectedChannelId.value = id; activeTab.value = "channel"; }
function toggleSpeaking() { speakingId.value = speakingId.value ? "" : selectedChannel.value.members[0]?.id ?? ""; }
function toggleMine(id: number) { const message = messages.value.find((m) => m.id === id); if (message) message.mine = !message.mine; }
function sendMessage() { const text = draft.value.trim(); if (!text) return; messages.value.push({ id: Date.now(), author: "illusia", time: "now", text, mine: true }); draft.value = ""; }
</script>

<style scoped>
:global(*) { box-sizing: border-box; }
:global(body) { margin: 0; font-family: var(--font-sans); background: var(--ws-surface-0); color: var(--ws-fg); }
.demo-page { min-height: 100dvh; padding: 0 28px 38px; background: radial-gradient(circle at 72% 12%, color-mix(in srgb, var(--ws-accent) 18%, transparent), transparent 26rem), var(--ws-surface-0); line-height: normal; }
.demo-reconnect { width: min(1380px, 100%); margin: 0 auto 14px }
.demo-shell { display: grid; grid-template-columns: 240px minmax(0, 1fr) 235px; gap: 18px; width: min(1380px, 100%); min-height: 720px; margin: 0 auto; }
.demo-channel-panel, .demo-actions-panel, .demo-main { min-width: 0; padding: 20px; border: 1px solid var(--ws-line); border-radius: 16px; background: color-mix(in srgb, var(--ws-surface-1) 90%, transparent); box-shadow: 0 12px 30px color-mix(in srgb, var(--ws-accent) 5%, transparent); }
.demo-main { padding: 27px 32px; }
.demo-poke { position: fixed; z-index: 10; top: 82px; right: 25px; width: min(380px, calc(100% - 32px)) }
:global(button:focus-visible), :global(a:focus-visible), :global(input:focus-visible), :global(select:focus-visible) { outline: 3px solid var(--ws-accent); outline-offset: 2px; }
@media (max-width: 1080px)  { .demo-shell { grid-template-columns: 210px minmax(0, 1fr); } }
@media (max-width: 720px)  { .demo-page { padding: 0 14px 24px; } .demo-shell { display: block; min-height: 0; } .demo-channel-panel { margin-bottom: 12px; } .demo-main { padding: 17px 14px; } }
/* The whole app is zoomed via #app (zoom:var(--ui-scale)) on large displays;
   divide the fixed poke banner offsets back to CSS pixels so it stays at the
   intended 82px/25px margin instead of drifting by the zoom factor. */
@media (min-width: 851px)  { .demo-poke { top: calc(82px / var(--ui-scale)); right: calc(25px / var(--ui-scale)); } }
</style>
