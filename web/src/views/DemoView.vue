<template>
  <div class="demo-page">
    <header class="demo-header">
      <div class="demo-brand"><span><Icon name="waveform" :size="21" /></span><div><strong>WebSpeak</strong><small>{{ copy.browserClient }}</small></div></div>
      <div class="demo-tools"><span class="demo-badge">{{ copy.demoBadge }}</span><LanguageSwitcher v-model="language" :menu-label="copy.languageMenu" @change="persistLanguage" /><Button as="a" href="/" variant="outline" size="sm" class="demo-back-full">{{ copy.back }}</Button><Button as="a" href="/" variant="outline" size="sm" icon-only :aria-label="copy.back" class="demo-back-compact"><Icon name="home" :size="16" /></Button></div>
    </header>

    <Banner v-if="reconnecting" variant="warning" icon="refresh" class="demo-reconnect">
      {{ copy.reconnecting }}
      <template #actions><Button size="sm" variant="outline" @click="reconnecting = false">{{ copy.restore }}</Button></template>
    </Banner>
    <main class="demo-shell">
      <aside class="demo-channel-panel" :aria-label="copy.channels">
        <div class="demo-panel-title"><span>{{ copy.channels }}</span><strong>{{ selectedChannel.name }}</strong></div>
        <div v-for="channel in channels" :key="channel.id" :class="['demo-channel', { active: selectedChannelId === channel.id }]">
          <Button variant="ghost" size="sm" :class="`w-full justify-start px-0 hover:bg-transparent ${selectedChannelId === channel.id ? 'text-accent' : 'text-fg-muted'}`" @click="selectChannel(channel.id)"><Icon name="volume" :size="16" /><span class="min-w-0 flex-1 truncate text-left">{{ channel.name }}</span><Count>{{ channel.members.length }}</Count></Button>
          <div class="demo-channel-members"><span v-for="member in channel.members" :key="member.id"><Avatar :name="member.name" size="xs" :speaking="speakingId === member.id" :speaking-label="copy.speaking" :class="selectedChannelId === channel.id ? '[--avatar-gap:var(--ws-accent-soft)]' : ''" />{{ member.name }}</span></div>
        </div>
      </aside>

      <section class="demo-main">
        <div class="demo-hero"><div><Chip variant="success" dot>{{ copy.simulated }}</Chip><h1><Icon name="volume" :size="24" /> {{ selectedChannel.name }}</h1><p>{{ copy.heroLead }}</p><small><Icon name="users" :size="14" /> {{ selectedChannel.members.length }} {{ copy.online }}</small></div><div class="demo-wave" aria-hidden="true"><i v-for="bar in bars" :key="bar" :style="{ height: `${bar}px` }"></i></div></div>
        <div class="demo-section-heading"><span>{{ copy.voiceActivity }}</span><strong>{{ copy.speakingNow }}</strong></div>
        <div class="demo-voice-grid"><article v-for="member in selectedChannel.members" :key="member.id" :class="['demo-voice-card', { speaking: speakingId === member.id }]" @click="speakingId = member.id"><Avatar :name="member.name" size="xl" /><strong>{{ member.name }}</strong><span class="demo-voice-status">{{ speakingId === member.id ? copy.speaking : copy.connected }}</span></article></div>

        <Separator class="demo-chat-rule" />
        <div class="demo-chat-head"><div><span>{{ copy.textChannel }}</span><strong># {{ selectedChannel.name }} {{ copy.chat }}</strong></div><Segmented v-model="activeTab" :aria-label="copy.chat" class="demo-tabs"><Segment v-for="tab in tabs" :key="tab.id" :value="tab.id">{{ tab.label }}</Segment></Segmented></div>
        <div class="demo-messages"><div v-for="message in visibleMessages" :key="message.id" :class="['demo-message', { mine: message.mine }]" @dblclick="message.mine = !message.mine"><Avatar :name="message.author" size="md" /><div><small>{{ message.author }} · {{ message.time }}</small><p>{{ messageText(message) }}</p></div></div><div v-if="!visibleMessages.length" class="demo-empty"><Icon name="message" :size="22" /><strong>{{ copy.emptyChat }}</strong></div></div>
        <form class="demo-composer" @submit.prevent="sendMessage"><Input v-model="draft" :placeholder="copy.placeholder" :aria-label="copy.placeholder" class="flex-1" /><Button type="submit" icon-only :aria-label="copy.send" :disabled="!draft.trim()"><Icon name="send" :size="17" /></Button></form>
      </section>

      <aside class="demo-actions-panel" :aria-label="copy.simulationControls"><div class="demo-panel-title"><span>{{ copy.voice }}</span><strong>{{ copy.simulationControls }}</strong></div><Button variant="outline" class="justify-start" @click="toggleSpeaking"><Icon name="mic" :size="17" /> {{ speakingId ? copy.stopSpeaking : copy.simulateSpeaking }}</Button><Button variant="outline" class="justify-start" @click="poke = !poke"><Icon name="bell" :size="17" /> {{ copy.poke }}</Button><Button variant="outline" class="justify-start" @click="reconnecting = true"><Icon name="refresh" :size="17" /> {{ copy.simulateReconnect }}</Button><div class="demo-note"><Icon name="shield" :size="16" /><span>{{ copy.demoNote }}</span></div><Separator class="demo-user-rule" /><div class="demo-user"><Avatar name="illusia" size="md" /><div><strong>illusia</strong><small>{{ copy.you }} · {{ copy.ready }}</small></div><span class="demo-green-dot"></span></div></aside>
    </main>
    <Banner v-if="poke" variant="warning" icon="bell" :title="`msicbot ${copy.pokedYou}`" dismissible :dismiss-label="copy.close" class="demo-poke shadow-lg" @dismiss="poke = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip, Count } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Segment, Segmented } from "@/components/ui/tabs";
import LanguageSwitcher from "../components/LanguageSwitcher.vue";
import { writeStorage } from "@/lib/safe-storage";
import { detectLanguage } from "@/i18n/use-i18n";

type Language = "zh" | "en" | "de" | "ru" | "ja";
interface DemoMessage { id: number; author: string; time: string; text: string; zhText?: string; enText?: string; ruText?: string; jaText?: string; mine: boolean }
type Tab = "channel" | "server";
const language = ref<Language>(detectLanguage());
const copy = computed(() => language.value === "zh" ? zh : language.value === "de" ? de : language.value === "ru" ? ru : language.value === "ja" ? ja : en);
const selectedChannelId = ref("quiet");
const activeTab = ref<Tab>("channel");
const speakingId = ref("illusia");
const reconnecting = ref(false);
const poke = ref(false);
const draft = ref("");
const bars = [15, 31, 21, 42, 25, 50, 32, 21, 38, 27, 45, 18, 33];
const channels = [
  { id: "quiet", name: "Quiet Zone", members: [{ id: "illusia", name: "illusia" }, { id: "msicbot", name: "msicbot" }] },
  { id: "lounge", name: "Lounge", members: [{ id: "alice", name: "Alice" }] },
  { id: "music", name: "Music room", members: [] },
];
const messages = ref<DemoMessage[]>([
  { id: 1, author: "illusia", time: "10:24", text: "", zhText: "大家好，欢迎来到 WebSpeak。", enText: "Hello everyone, welcome to WebSpeak.", mine: true },
  { id: 2, author: "msicbot", time: "10:25", text: "", zhText: "语音和文字频道都已同步。", enText: "Voice and text channels are in sync.", mine: false },
]);
const zh = { languageMenu: "语言", browserClient: "浏览器语音工作台", demoBadge: "演示 — 模拟数据", languageSwitch: "English", back: "返回主页", reconnecting: "连接中断，正在恢复…", restore: "恢复连接", channels: "频道", channel: "频道", simulated: "演示状态", heroLead: "这里展示 WebSpeak 的频道、语音和聊天交互。", online: "人在线", voiceActivity: "语音活动", speakingNow: "正在语音中", speaking: "正在说话…", connected: "已连接", textChannel: "文字频道", chat: "聊天", server: "服务器", emptyChat: "暂无消息", placeholder: "发送一条消息…", voice: "语音", simulationControls: "模拟控制", stopSpeaking: "停止说话", simulateSpeaking: "模拟发言", poke: "戳一戳", simulateReconnect: "模拟重连", demoNote: "此页面不会连接真实 TeamSpeak 服务器。", you: "你", close: "关闭", send: "发送", ready: "已就绪", pokedYou: "戳了你一下" };
const en = { languageMenu: "Language", browserClient: "Browser voice workspace", demoBadge: "Demo — simulated data", languageSwitch: "中文", back: "Back home", reconnecting: "Connection interrupted, recovering…", restore: "Restore", channels: "Channels", channel: "Channel", simulated: "Simulation", heroLead: "A preview of WebSpeak channels, voice, and chat interactions.", online: "online", voiceActivity: "VOICE ACTIVITY", speakingNow: "Speaking now", speaking: "Speaking…", connected: "Connected", textChannel: "TEXT CHANNEL", chat: "chat", server: "Server", emptyChat: "No messages yet", placeholder: "Send a message…", voice: "Voice", simulationControls: "Simulation controls", stopSpeaking: "Stop speaking", simulateSpeaking: "Simulate speaking", poke: "Poke", simulateReconnect: "Simulate reconnect", demoNote: "This page never connects to a real TeamSpeak server.", you: "You", close: "Close", send: "Send", ready: "Ready", pokedYou: "poked you" };
const de = { languageMenu: "Sprache", browserClient: "Sprachbereich im Browser", demoBadge: "Demo — simulierte Daten", languageSwitch: "中文", back: "Zur Startseite", reconnecting: "Verbindung unterbrochen, Wiederherstellung…", restore: "Wiederherstellen", channels: "Kanäle", channel: "Kanal", simulated: "Simulation", heroLead: "Eine Vorschau auf Kanäle, Sprache und Chat von WebSpeak.", online: "online", voiceActivity: "SPRACHAKTIVITÄT", speakingNow: "Spricht gerade", speaking: "Spricht…", connected: "Verbunden", textChannel: "TEXTKANAL", chat: "Chat", server: "Server", emptyChat: "Noch keine Nachrichten", placeholder: "Nachricht senden…", voice: "Sprache", simulationControls: "Simulation steuern", stopSpeaking: "Sprechen stoppen", simulateSpeaking: "Sprechen simulieren", poke: "Anstupsen", simulateReconnect: "Verbindung simulieren", demoNote: "Diese Seite verbindet sich nie mit einem echten TeamSpeak-Server.", you: "Du", close: "Schließen", send: "Senden", ready: "Bereit", pokedYou: "hat dich angestupst" };
const ru = { languageMenu: "Язык", browserClient: "Голосовое пространство в браузере", demoBadge: "Демо — симуляция", languageSwitch: "中文", back: "На главную", reconnecting: "Соединение прервано, восстановление…", restore: "Восстановить", channels: "Каналы", channel: "Канал", simulated: "Симуляция", heroLead: "Предпросмотр каналов, голоса и чата WebSpeak.", online: "онлайн", voiceActivity: "ГОЛОСОВАЯ АКТИВНОСТЬ", speakingNow: "Сейчас говорят", speaking: "Говорит…", connected: "Подключён", textChannel: "ТЕКСТОВЫЙ КАНАЛ", chat: "чат", server: "Сервер", emptyChat: "Сообщений пока нет", placeholder: "Написать сообщение…", voice: "Голос", simulationControls: "Управление симуляцией", stopSpeaking: "Остановить речь", simulateSpeaking: "Симулировать речь", poke: "Толкнуть", simulateReconnect: "Симулировать переподключение", demoNote: "Эта страница не подключается к реальному серверу TeamSpeak.", you: "Вы", close: "Закрыть", send: "Отправить", ready: "Готово", pokedYou: "толкнул вас" };
const ja = { languageMenu: "言語", browserClient: "ブラウザ音声ワークスペース", demoBadge: "デモ — シミュレーション", languageSwitch: "中文", back: "ホームに戻る", reconnecting: "接続が中断されました。復旧中…", restore: "復旧", channels: "チャンネル", channel: "チャンネル", simulated: "シミュレーション", heroLead: "WebSpeak のチャンネル、音声、チャットのプレビューです。", online: "人がオンライン", voiceActivity: "音声アクティビティ", speakingNow: "発話中", speaking: "発話中…", connected: "接続済み", textChannel: "テキストチャンネル", chat: "チャット", server: "サーバー", emptyChat: "メッセージはありません", placeholder: "メッセージを送信…", voice: "音声", simulationControls: "シミュレーション操作", stopSpeaking: "発話を停止", simulateSpeaking: "発話をシミュレート", poke: "つつく", simulateReconnect: "再接続をシミュレート", demoNote: "このページは実際の TeamSpeak サーバーには接続しません。", you: "あなた", close: "閉じる", send: "送信", ready: "準備完了", pokedYou: "あなたをつつきました" };
const tabs = computed(() => [{ id: "channel" as const, label: copy.value.channel }, { id: "server" as const, label: copy.value.server }]);
const selectedChannel = computed(() => channels.find((channel) => channel.id === selectedChannelId.value) ?? channels[0]);
const visibleMessages = computed(() => activeTab.value === "channel" ? messages.value : []);

function persistLanguage() { writeStorage("webspeak:language", language.value); }
function selectChannel(id: string) { selectedChannelId.value = id; activeTab.value = "channel"; }
function toggleSpeaking() { speakingId.value = speakingId.value ? "" : selectedChannel.value.members[0]?.id ?? ""; }
function messageText(message: DemoMessage): string { return language.value === "zh" ? message.zhText ?? message.text : language.value === "ru" ? message.ruText ?? message.enText ?? message.text : language.value === "ja" ? message.jaText ?? message.enText ?? message.text : message.enText ?? message.text; }
function sendMessage() { const text = draft.value.trim(); if (!text) return; messages.value.push({ id: Date.now(), author: "illusia", time: "now", text, mine: true }); draft.value = ""; }
</script>

<style scoped>
:global(*) { box-sizing: border-box; }
:global(body) { margin: 0; font-family: var(--font-sans); background: var(--ws-surface-0); color: var(--ws-fg); }
.demo-page { min-height: 100dvh; padding: 0 28px 38px; background: radial-gradient(circle at 72% 12%, color-mix(in srgb, var(--ws-accent) 18%, transparent), transparent 26rem), var(--ws-surface-0); }
.demo-header { display: flex; align-items: center; justify-content: space-between; width: min(1380px, 100%); min-height: 82px; margin: 0 auto; }
.demo-brand, .demo-tools, .demo-brand > div, .demo-tools { display: flex; align-items: center; }.demo-brand { gap: 10px; }.demo-brand > span { display: grid; place-items: center; width: 39px; height: 39px; color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 12px; }.demo-brand strong, .demo-brand small { display: block; }.demo-brand strong { color: var(--ws-accent); font-size: 18px; }.demo-brand small { margin-top: 2px; color: var(--ws-fg-muted); font-size: 10px; }.demo-tools { gap: 15px; color: var(--ws-fg-muted); font-size: 12px; }.demo-badge { color: var(--ws-success); font-weight: 700; }.demo-back-compact { display: none; }
.demo-reconnect { width: min(1380px, 100%); margin: 0 auto 14px }.demo-shell { display: grid; grid-template-columns: 240px minmax(0, 1fr) 235px; gap: 18px; width: min(1380px, 100%); min-height: 720px; margin: 0 auto; }.demo-channel-panel, .demo-actions-panel, .demo-main { min-width: 0; padding: 20px; border: 1px solid var(--ws-line); border-radius: 16px; background: color-mix(in srgb, var(--ws-surface-1) 90%, transparent); box-shadow: 0 12px 30px color-mix(in srgb, var(--ws-accent) 5%, transparent); }.demo-panel-title { display: grid; gap: 5px; margin-bottom: 20px; }.demo-panel-title span, .demo-section-heading span, .demo-chat-head span { color: var(--ws-fg-muted); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }.demo-panel-title strong { color: var(--ws-fg); font-size: 18px; }.demo-channel { margin: 4px -8px 12px; padding: 3px 8px 9px; border-radius: 10px; }.demo-channel.active { background: var(--ws-accent-soft); }.demo-channel-members { display: grid; gap: 7px; padding-left: 22px; color: var(--ws-fg-muted); font-size: 11px; }.demo-channel-members span { display: flex; align-items: center; gap: 7px; }
.demo-main { padding: 27px 32px; }.demo-hero { display: flex; align-items: center; justify-content: space-between; min-height: 190px; padding: 26px 29px; overflow: hidden; border-radius: 14px; background: linear-gradient(112deg, var(--ws-accent-soft), var(--ws-surface-0)); }.demo-green-dot { width: 7px; height: 7px; background: var(--ws-success); border-radius: 50%; }.demo-hero h1 { display: flex; align-items: center; gap: 8px; margin: 17px 0 7px; color: var(--ws-fg); font-size: 28px; letter-spacing: -.05em; }.demo-hero p { margin: 0 0 15px; color: var(--ws-fg-muted); font-size: 12px; }.demo-hero small { display: flex; align-items: center; gap: 6px; color: var(--ws-fg-muted); font-size: 11px; }.demo-wave { display: flex; align-items: center; gap: 5px; height: 60px; padding-right: 22px; }.demo-wave i { width: 4px; border-radius: 4px; background: var(--ws-accent); }.demo-wave i:nth-child(3n) { background: var(--ws-success); }.demo-section-heading { display: grid; gap: 5px; margin: 31px 0 15px; }.demo-section-heading strong { color: var(--ws-fg); font-size: 21px; }.demo-voice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(125px, 1fr)); gap: 11px; }.demo-voice-card { display: grid; justify-items: center; gap: 7px; padding: 15px 8px; border: 1px solid var(--ws-line); border-radius: 12px; background: var(--ws-surface-1); cursor: pointer; }.demo-voice-card strong { color: var(--ws-fg); font-size: 12px; }.demo-voice-status { color: var(--ws-fg-muted); font-size: 10px; }.demo-voice-card.speaking { border-color: var(--ws-success); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ws-success) 18%, transparent), 0 8px 20px color-mix(in srgb, var(--ws-success) 12%, transparent); }.demo-voice-card.speaking .demo-voice-status { color: var(--ws-success); }.demo-chat-rule { margin-top: 33px; }.demo-chat-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-top: 23px; }.demo-chat-head strong { display: block; margin-top: 6px; color: var(--ws-fg); font-size: 20px; }.demo-messages { display: grid; align-content: start; gap: 13px; min-height: 215px; max-height: 270px; margin-top: 17px; overflow-y: auto; padding: 7px 3px; }.demo-message { display: flex; align-items: flex-start; gap: 9px; max-width: 76%; }.demo-message.mine { justify-self: end; flex-direction: row-reverse; text-align: right; }.demo-message small { color: var(--ws-fg-muted); font-size: 9px; }.demo-message p { margin: 4px 0 0; padding: 8px 11px; color: var(--ws-fg); background: var(--ws-surface-0); border-radius: 4px 11px 11px 11px; font-size: 12px; }.demo-message.mine p { color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 11px 4px 11px 11px; }.demo-empty { display: grid; place-content: center; justify-items: center; gap: 8px; min-height: 170px; color: var(--ws-fg-muted); }.demo-empty strong { font-size: 12px; }.demo-composer { display: flex; gap: 8px }.demo-actions-panel { display: flex; flex-direction: column; gap: 9px; }.demo-note { display: flex; gap: 8px; margin-top: 10px; padding: 11px; color: var(--ws-fg-muted); background: var(--ws-surface-0); border-radius: 9px; font-size: 10px; line-height: 1.5; }.demo-user-rule { margin-top: auto; }.demo-user { display: flex; align-items: center; gap: 9px; margin-top: 6px; }.demo-user div { min-width: 0; flex: 1; }.demo-user strong, .demo-user small { display: block; }.demo-user strong { color: var(--ws-fg); font-size: 12px; }.demo-user small { margin-top: 4px; color: var(--ws-fg-muted); font-size: 10px; }.demo-poke { position: fixed; z-index: 10; top: 82px; right: 25px; width: min(380px, calc(100% - 32px)) }@media (max-width: 1080px) { .demo-shell { grid-template-columns: 210px minmax(0, 1fr); }.demo-actions-panel { grid-column: 1 / -1; min-height: 160px; }.demo-actions-panel .demo-panel-title { margin-bottom: 3px; }.demo-actions-panel > button { display: inline-flex; width: fit-content; }.demo-note { margin-top: 4px; }.demo-user-rule { margin-top: 0; } }
@media (max-width: 720px) { .demo-page { padding: 0 14px 24px; }.demo-header { min-height: 68px; }.demo-tools { gap: 6px; font-size: 10px; }.demo-badge { display: none; }.demo-shell { display: block; min-height: 0; }.demo-channel-panel { margin-bottom: 12px; }.demo-channel-panel .demo-channel:not(.active) .demo-channel-members { display: none; }.demo-actions-panel { margin-top: 12px; }.demo-main { padding: 17px 14px; }.demo-hero { min-height: 170px; padding: 20px; }.demo-wave { padding-right: 0; transform: scale(.75); transform-origin: right center; }.demo-chat-head { display: grid; align-items: start; }.demo-tabs { overflow-x: auto; }.demo-message { max-width: 94%; } }
@media (max-width: 420px) { .demo-back-full { display: none; }.demo-back-compact { display: inline-flex; } }
@media (max-width: 360px) { .demo-hero h1 { font-size: 23px; }.demo-hero p { font-size: 11px; }.demo-voice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* The whole app is zoomed via #app (zoom:var(--ui-scale)) on large displays;
   divide the fixed poke banner offsets back to CSS pixels so it stays at the
   intended 82px/25px margin instead of drifting by the zoom factor. */
@media (min-width: 851px) { .demo-poke { top: calc(82px / var(--ui-scale)); right: calc(25px / var(--ui-scale)); } }
:global(button:focus-visible), :global(a:focus-visible), :global(input:focus-visible), :global(select:focus-visible) { outline: 3px solid var(--ws-accent); outline-offset: 2px; }
</style>
