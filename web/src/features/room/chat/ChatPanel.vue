<template>
  <section :class="['chat-panel', { 'mobile-section-hidden': mobileSection !== 'chat' }]">
    <div class="chat-tabs" role="tablist" :aria-label="t('chatTabs')">
      <button type="button" role="tab" :id="chatTabId('channel')" :aria-selected="chatTab === 'channel'" :aria-controls="chatPanelId" :class="{ active: chatTab === 'channel' }" @click="chatTab = 'channel'"><Icon name="hash" :size="15" /> {{ currentChannelName }}</button>
      <button type="button" role="tab" :id="chatTabId('server')" :aria-selected="chatTab === 'server'" :aria-controls="chatPanelId" :class="{ active: chatTab === 'server' }" @click="chatTab = 'server'"><Icon name="server" :size="15" /> {{ t('serverChat') }}</button>
      <button v-for="conversation in privateConversations" :key="conversation.id" type="button" role="tab" :id="chatTabId(`private-${conversation.id}`)" :aria-selected="chatTab === 'private' && privateClientId === conversation.id" :aria-controls="chatPanelId" :class="{ active: chatTab === 'private' && privateClientId === conversation.id }" @click="$emit('open-private-chat', conversation.id)"><Icon name="message" :size="15" /> {{ conversation.name }}</button>
      <button type="button" role="tab" :id="chatTabId('events')" :aria-selected="chatTab === 'events'" :aria-controls="chatPanelId" :class="{ active: chatTab === 'events' }" @click="chatTab = 'events'"><Icon name="bell" :size="15" /> {{ t('eventLog') }}</button>
    </div>
    <div class="section-heading chat-heading"><div><span class="section-kicker">{{ chatTabLabel }}</span><h2><Icon :name="chatTab === 'server' ? 'server' : chatTab === 'events' ? 'bell' : chatTab === 'private' ? 'message' : 'hash'" :size="20" /> {{ chatTitle }}</h2></div><span class="section-counter">{{ chatTab === 'events' ? t('eventCount', { count: serverEvents.length }) : t('messageCount', { count: visibleChatMessages.length }) }}</span></div>
    <div :ref="setListElement" class="message-list" role="tabpanel" :id="chatPanelId" :aria-labelledby="activeChatTabId">
      <div v-if="chatTab === 'events'">
        <article v-for="event in serverEvents" :key="event.id" class="event-row"><time>{{ formatTime(event.timestamp) }}</time><span>{{ eventText(event) }}</span></article>
        <div v-if="!serverEvents.length" class="chat-empty"><div class="chat-empty-icon"><Icon name="bell" :size="24" /></div><strong>{{ t('noEvents') }}</strong><span>{{ t('noEventsLead') }}</span></div>
      </div>
      <div v-else-if="!visibleChatMessages.length" class="chat-empty"><div class="chat-empty-icon"><Icon name="message" :size="24" /></div><strong>{{ chatTab === 'private' ? t('privateChatStart') : t('chatStart') }}</strong><span>{{ chatTab === 'private' ? t('privateChatStartLead') : t('chatStartLead') }}</span></div>
      <template v-for="message in visibleChatMessages" :key="message.id">
        <article v-if="chatTab !== 'events'" :class="['message-row', { mine: message.isSelf }]">
          <Avatar :name="message.invokerName" :src="messageAvatar(message, members) || undefined" size="md" surface="surface-1" class="text-[11px] text-accent-fg max-[740px]:size-9" :style="avatarStyle(message.invokerName, message.isSelf)" />
          <div class="message-body"><div class="message-meta"><strong>{{ message.isSelf ? t('you') : message.invokerName }}</strong><time>{{ formatTime(message.timestamp) }}</time></div><div class="message-bubble">{{ message.message }}</div></div>
        </article>
      </template>
    </div>
    <form v-if="chatTab !== 'events'" class="message-composer" @submit.prevent="$emit('submit')">
      <Input v-model="messageDraft" maxlength="500" :placeholder="chatPlaceholder" :aria-label="t('send')" class="flex-1" input-class="h-9 border-0 bg-transparent px-0 text-[15px] max-[740px]:text-sm" />
      <Button type="submit" icon-only class="size-[34px] shrink-0 rounded-[9px]" :disabled="!messageDraft.trim()" :title="t('send')" :aria-label="t('send')"><Icon name="send" :size="18" /></Button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { avatarStyle } from "@/shared/lib/format.js";
import { messageAvatar } from "@/features/session";
import type { ChannelMember, ChatMessage, ServerEvent } from "@/features/session";

defineProps<{
  mobileSection: "channels" | "chat" | "voice" | "more";
  currentChannelName: string;
  privateConversations: Array<{ id: number; name: string; lastMessage: number }>;
  privateClientId: number;
  chatTabLabel: string;
  chatTitle: string;
  chatPlaceholder: string;
  chatPanelId: string;
  chatTabId: (key: string) => string;
  activeChatTabId: string;
  serverEvents: ServerEvent[];
  visibleChatMessages: ChatMessage[];
  members: ChannelMember[];
  eventText: (event: ServerEvent) => string;
  formatTime: (timestamp: number) => string;
  setListElement: (element: unknown) => void;
}>();

defineEmits<{
  (e: "open-private-chat", clientId: number): void;
  (e: "submit"): void;
}>();

const chatTab = defineModel<"channel" | "server" | "private" | "events">("chatTab", { default: "channel" });
const messageDraft = defineModel<string>("messageDraft", { default: "" });

const { t } = useI18n();
</script>

<style scoped>
/* Same heading rules as VoiceGrid's and MemberPanel's — duplicated here because scoped styles
   do not reach another component's markup (Track 2.9's note on this exact problem). */
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.section-heading h2 { display: flex; align-items: center; gap: 7px; margin: 6px 0 0; color: var(--ws-fg); font-size: 20px; font-weight: 700; letter-spacing: -.04em; }
.section-counter { color: var(--ws-fg-muted); font-size: 10px; }
.section-kicker { color: var(--ws-fg-muted); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
@media (max-width: 420px) { .section-counter { display: none; } }

.chat-panel { margin-top: 34px; padding: 0 0 16px; border-top: 1px solid var(--ws-line); }
.chat-heading { padding-top: 25px; }
.chat-heading h2 .ui-icon { color: var(--ws-accent); }
.chat-tabs { display: flex; align-items: center; gap: 6px; max-width: 100%; margin-top: 18px; overflow-x: auto; padding-bottom: 3px; }
.chat-tabs button { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; padding: 7px 10px; color: var(--ws-fg-muted); background: var(--ws-surface-0); border: 1px solid transparent; border-radius: 7px; font-size: 11px; cursor: pointer; }
.chat-tabs button:hover { color: var(--ws-accent); background: var(--ws-surface-2); }
.chat-tabs button.active { color: var(--ws-accent); background: var(--ws-accent-soft); border-color: var(--ws-line); font-weight: 700; }
.event-row { display: flex; align-items: baseline; gap: 12px; padding: 9px 10px; color: var(--ws-fg-muted); border-bottom: 1px solid var(--ws-line); font-size: 12px; line-height: 1.45; }
.event-row time { flex: 0 0 auto; color: var(--ws-fg-muted); font-size: 10px; }
.message-list { display: flex; flex-direction: column; gap: 18px; min-height: 170px; max-height: 360px; overflow-y: auto; padding: 22px 8px 10px 3px; }
.message-list { min-height: clamp(150px, 20dvh, 220px); max-height: min(360px, 42dvh); }
.chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 145px; color: var(--ws-fg-muted); text-align: center; }
.chat-empty-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 11px; color: var(--ws-accent); background: var(--ws-accent-soft); border-radius: 14px; }
.chat-empty strong { color: var(--ws-fg-muted); font-size: 12px; }
.chat-empty span { margin-top: 5px; font-size: 10px; }
.message-row { display: flex; align-items: flex-start; gap: 11px; max-width: 78%; }
.message-row.mine { align-self: flex-end; flex-direction: row-reverse; }
.message-body { min-width: 0; }
.message-meta { display: flex; align-items: baseline; gap: 8px; margin: 1px 0 6px; }
.message-row.mine .message-meta { justify-content: flex-end; }
.message-meta strong { color: var(--ws-fg); font-size: 11px; }
.message-meta time { color: var(--ws-fg-muted); font-size: 9px; }
.message-bubble { padding: 10px 13px; color: var(--ws-fg); background: var(--ws-surface-0); border-radius: 4px 13px 13px 13px; font-size: 12px; line-height: 1.55; }
.message-row.mine .message-bubble { color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 13px 4px 13px 13px; }
.message-composer { display: flex; align-items: center; gap: 7px; min-height: 48px; padding: 6px 8px 6px 12px; background: var(--ws-surface-0); border-radius: 11px; }

@media (max-width: 740px) {
  .message-row { max-width: 92%; }
}

.app-shell .section-kicker, .app-shell .section-counter { font-size: 12.5px; }
.app-shell .section-heading h2 { font-size: 25px; }
.app-shell .chat-empty strong { font-size: 15px; }
.app-shell .chat-empty span { font-size: 12.5px; }
.app-shell .message-meta strong { font-size: 13.75px; }
.app-shell .message-meta time { font-size: 11.25px; }
.app-shell .message-bubble { font-size: 15px; }

@media (max-width: 740px) {
  .app-shell .section-heading h2 { font-size: 21.25px; }
  .app-shell .message-bubble { font-size: 13.75px; }
}

.chat-panel { min-height: 0; }

.message-composer { background: var(--ws-surface-2); }
.section-heading h2 { color: var(--ws-fg); }
.section-kicker, .section-counter { color: var(--ws-fg-muted); }
.message-meta time, .chat-empty { color: var(--ws-fg-muted); }
.chat-panel, .chat-heading { border-color: var(--ws-line); }
.message-bubble { color: var(--ws-fg); background: var(--ws-surface-2); }

.message-composer { position: sticky; bottom: env(safe-area-inset-bottom, 0px); z-index: 3; }
@media (max-width: 740px) { .message-composer { margin-bottom: 8px; } }

@media (max-width: 740px) {
  .section-heading { gap: 10px; }
  .section-heading h2 { font-size: 22px; }

  .app-shell.mobile-view-chat .chat-panel { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; margin-top: 0; padding: 0; border-top: 0; }
  .app-shell.mobile-view-chat .chat-tabs { flex: 0 0 auto; margin-top: 0; padding: 10px 0 9px; border-bottom: 1px solid var(--ws-line); scrollbar-width: none; }
  .app-shell.mobile-view-chat .chat-tabs::-webkit-scrollbar { display: none; }
  .app-shell.mobile-view-chat .chat-heading { flex: 0 0 auto; padding: 13px 0 9px; }
  .app-shell.mobile-view-chat .chat-heading h2 { font-size: 21px; }
  .app-shell.mobile-view-chat .message-list { flex: 1 1 auto; min-height: 0; max-height: none; padding: 10px 2px 16px; overflow-y: auto; overscroll-behavior: contain; }
  .app-shell.mobile-view-chat .message-row { max-width: 94%; gap: 9px; }
  .app-shell.mobile-view-chat .message-meta strong { font-size: 12px; }
  .app-shell.mobile-view-chat .message-bubble { padding: 10px 12px; font-size: 14px; }
  .app-shell.mobile-view-chat .message-composer { position: relative; flex: 0 0 auto; min-height: 54px; margin: 0 0 4px; padding: 7px 8px 7px 13px; border: 1px solid var(--ws-line); }
}

@media (min-width: 741px) {
  .app-shell .chat-panel { position: relative; padding-bottom: calc(16px + 48px); }
  .app-shell .message-composer { position: absolute; z-index: 3; left: 0; right: 0; bottom: 16px; margin-bottom: 0; }
}
</style>
