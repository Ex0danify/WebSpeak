<template>
  <div v-if="currentMembers.length" class="voice-grid">
    <VoiceCard
      v-for="member in roomMembers"
      :key="member.id"
      :member="member"
      :speaking="isSpeaking(member, speakingIds)"
      :is-mobile-viewport="isMobileViewport"
      :stream="screenShareStreamForMember(member)"
      :screen-share-active="screenShareActive"
      :screen-share-starting="screenShareStarting"
      :screen-share-viewing-stream-id="screenShareViewingStreamId"
      :screen-share-indicator-bars="screenShareIndicatorBars"
      v-model:screen-share-settings-open="screenShareSettingsOpen"
      @open-actions="$emit('open-member-actions', member)"
      @stop-screen-share="$emit('stop-screen-share')"
      @start-screen-share="$emit('start-screen-share')"
      @toggle-screen-share="$emit('toggle-screen-share', member)"
    />
    <article v-if="currentMembers.length > roomMembers.length" class="voice-card more-card"><div class="more-count">+{{ currentMembers.length - roomMembers.length }}</div><strong>{{ t('moreMembers') }}</strong><span>{{ t('viewLeft') }}</span></article>
  </div>
  <div v-else class="voice-empty"><span class="empty-icon"><Icon name="users" :size="20" /></span><strong>{{ t('waitingForMembers') }}</strong><span>{{ t('prepareMicrophone') }}</span></div>
</template>

<script setup lang="ts">
import { Icon } from "@/components/ui/icon";
import VoiceCard from "./VoiceCard.vue";
import { useI18n } from "@/i18n/use-i18n.js";
import { isSpeaking } from "@/lib/format.js";
import type { ChannelMember, ScreenShareStream } from "@/composables/useVoiceWebSocket.js";

defineProps<{
  currentMembers: ChannelMember[];
  roomMembers: ChannelMember[];
  speakingIds: Set<number>;
  isMobileViewport: boolean;
  screenShareStreamForMember: (member: ChannelMember) => ScreenShareStream | null;
  screenShareActive: boolean;
  screenShareStarting: boolean;
  screenShareViewingStreamId: string;
  screenShareIndicatorBars: number[];
}>();

defineEmits<{
  (e: "open-member-actions", member: ChannelMember): void;
  (e: "stop-screen-share"): void;
  (e: "start-screen-share"): void;
  (e: "toggle-screen-share", member: ChannelMember): void;
}>();

const screenShareSettingsOpen = defineModel<boolean>("screenShareSettingsOpen", { default: false });

const { t } = useI18n();
</script>

<style scoped>
.voice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 12px; margin-top: 17px; }
.voice-card { min-height: 152px; padding: 17px 11px 13px; border: 1px solid var(--ws-line); border-radius: 13px; background: var(--ws-surface-1); box-shadow: var(--shadow-sm); text-align: center; transition: .18s; }
.voice-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.voice-card.speaking { border-color: var(--ws-success); box-shadow: 0 0 14px color-mix(in srgb, var(--ws-success) 35%, transparent); }
.voice-card > strong, .voice-card > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voice-card > strong { color: var(--ws-fg); font-size: 12px; }
.voice-card > span { margin-top: 5px; color: var(--ws-fg-muted); font-size: 10px; }
.voice-card.speaking > span { color: var(--ws-success); }
.more-card { display: grid; place-items: center; align-content: center; }
.more-count { display: grid; place-items: center; width: 54px; height: 54px; margin-bottom: 11px; color: var(--ws-accent); background: var(--ws-accent-soft); border-radius: 50%; font-size: 14px; font-weight: 700; }
.empty-icon { display: grid; place-items: center; width: 34px; height: 34px; margin: 0 auto 9px; color: var(--ws-accent); background: var(--ws-accent-soft); border-radius: 10px; }
.voice-empty { display: flex; align-items: center; gap: 11px; margin-top: 17px; padding: 18px; color: var(--ws-fg-muted); border: 1px dashed var(--ws-line); border-radius: 12px; font-size: 11px; }
.voice-empty .empty-icon { margin: 0; width: 34px; height: 34px; }
.voice-empty strong { color: var(--ws-fg-muted); }
.voice-empty span:last-child { margin-left: auto; }

@media (max-width: 740px) { .voice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.voice-card { min-height: 143px; } }
@media (max-width: 420px) { .voice-grid { gap: 8px; }.voice-card { padding-inline: 6px; } }

/* Increase connected-view typography by 25%, matching WebClient.vue's app-shell scale. */
.app-shell .voice-card > strong { font-size: 15px; }
.app-shell .voice-card > span { font-size: 12.5px; }
.app-shell .more-count { font-size: 17.5px; }
.app-shell .voice-empty { font-size: 13.75px; }

.voice-card { background: var(--ws-surface-1); border-color: var(--ws-line); }
.voice-card { box-shadow: 0 7px 18px color-mix(in srgb, var(--ws-fg) 8%, transparent); }

@media (max-width: 740px) {
  .voice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
  .voice-card { position: relative; min-height: 136px; padding: 18px 8px 14px; border-radius: 16px; }
  .app-shell .voice-card > strong { max-width: 100%; font-size: 14px; }
  .app-shell .voice-card > span { margin-top: 4px; font-size: 11px; }
}
</style>
