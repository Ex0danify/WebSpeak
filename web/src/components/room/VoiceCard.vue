<template>
  <article :class="['voice-card', { speaking, self: member.isSelf }]">
    <button v-if="isMobileViewport && !member.isSelf" type="button" class="voice-member-action" :aria-label="t('moreMemberOptions')" @click.stop="$emit('open-actions')"><Icon name="more" :size="17" /></button>
    <div :class="['voice-avatar-wrap', { 'screen-share-avatar-wrap': stream }]">
      <div :class="['voice-avatar', { speaking }]" :style="avatarStyle(member.nickname, member.isSelf, member.avatar)">{{ member.avatar ? '' : avatarInitial(member.nickname) }}</div>
      <span v-if="stream" class="screen-share-live-indicator"><span class="screen-share-wave" aria-hidden="true"><i v-for="bar in screenShareIndicatorBars" :key="bar" :style="{ height: `${bar}px` }"></i></span><span>{{ t('sharingScreen') }}</span></span>
      <button v-if="member.isSelf && (screenShareActive || screenShareStarting)" type="button" class="screen-share-stop-button" :aria-label="t('stopScreenShare')" :title="t('stopScreenShare')" @click.stop="$emit('stop-screen-share')"><Icon name="close" :size="14" /></button>
    </div>
    <strong>{{ member.isSelf ? t('you') : member.nickname }}</strong><span>{{ speaking ? t('speaking') : member.isSelf ? t('connectedYou') : t('connected') }}</span>
    <div v-if="member.isSelf || stream" class="screen-share-card-actions">
      <template v-if="member.isSelf && !screenShareActive && !screenShareStarting">
        <div class="screen-share-start-actions">
          <button type="button" class="screen-share-card-button" @click.stop="$emit('start-screen-share')"><Icon name="monitor" :size="13" /> {{ t('startScreenShare') }}</button>
          <button type="button" class="screen-share-settings-button" :aria-label="t('screenShareSettings')" :aria-expanded="screenShareSettingsOpen" :title="t('screenShareSettings')" @click.stop="screenShareSettingsOpen = !screenShareSettingsOpen"><Icon name="settings" :size="13" /></button>
        </div>
      </template>
      <button v-else-if="!member.isSelf" type="button" :class="['screen-share-card-button', { viewing: screenShareViewingStreamId === stream?.streamId }]" @click.stop="$emit('toggle-screen-share')"><Icon name="monitor" :size="13" /> {{ screenShareViewingStreamId === stream?.streamId ? t('watching') : t('watchScreenShare') }}</button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/i18n/use-i18n.js";
import { avatarInitial, avatarStyle } from "@/lib/format.js";
import type { ChannelMember, ScreenShareStream } from "@/composables/useVoiceWebSocket.js";

defineProps<{
  member: ChannelMember;
  speaking: boolean;
  isMobileViewport: boolean;
  stream: ScreenShareStream | null;
  screenShareActive: boolean;
  screenShareStarting: boolean;
  screenShareViewingStreamId: string;
  screenShareIndicatorBars: number[];
}>();

defineEmits<{
  (e: "open-actions"): void;
  (e: "stop-screen-share"): void;
  (e: "start-screen-share"): void;
  (e: "toggle-screen-share"): void;
}>();

const screenShareSettingsOpen = defineModel<boolean>("screenShareSettingsOpen", { default: false });

const { t } = useI18n();
</script>

<style scoped>
.voice-card { min-height: 152px; padding: 17px 11px 13px; border: 1px solid var(--ws-line); border-radius: 13px; background: var(--ws-surface-1); box-shadow: var(--shadow-sm); text-align: center; transition: .18s; }
.voice-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.voice-card.speaking { border-color: var(--ws-success); box-shadow: 0 0 14px color-mix(in srgb, var(--ws-success) 35%, transparent); }
.voice-avatar-wrap { position: relative; width: 68px; margin: 0 auto 11px; }
.voice-avatar { display: grid; place-items: center; width: 68px; height: 68px; color: var(--ws-accent-fg); border-radius: 50%; font-size: 20px; font-weight: 700; }
.voice-card > strong, .voice-card > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voice-card > strong { color: var(--ws-fg); font-size: 12px; }
.voice-card > span { margin-top: 5px; color: var(--ws-fg-muted); font-size: 10px; }
.voice-card.speaking > span { color: var(--ws-success); }

@media (max-width: 740px) { .voice-card { min-height: 143px; } }
@media (max-width: 420px) { .voice-card { padding-inline: 6px; } }

/* Increase connected-view typography by 25%, matching WebClient.vue's app-shell scale. */
.app-shell .voice-card > strong { font-size: 15px; }
.app-shell .voice-card > span { font-size: 12.5px; }

.voice-avatar.speaking { box-shadow: 0 0 0 3px var(--ws-success), 0 0 14px color-mix(in srgb, var(--ws-success) 48%, transparent); }

.voice-card { background: var(--ws-surface-1); border-color: var(--ws-line); }
.voice-card { box-shadow: 0 7px 18px color-mix(in srgb, var(--ws-fg) 8%, transparent); }

.voice-member-action { display: none; }

@media (max-width: 740px) {
  .voice-card { position: relative; min-height: 136px; padding: 18px 8px 14px; border-radius: 16px; }
  .voice-avatar-wrap, .voice-avatar { width: 60px; height: 60px; }
  .voice-avatar-wrap { margin-bottom: 10px; }
  .voice-avatar { font-size: 18px; }
  .app-shell .voice-card > strong { max-width: 100%; font-size: 14px; }
  .app-shell .voice-card > span { margin-top: 4px; font-size: 11px; }
  .voice-member-action { position: absolute; top: 7px; right: 7px; display: grid; place-items: center; width: 34px; height: 34px; color: var(--ws-fg-muted); background: color-mix(in srgb, var(--ws-surface-2) 78%, transparent); border-radius: 10px; cursor: pointer; }
  .voice-member-action:hover, .voice-member-action:active { color: var(--ws-accent); background: color-mix(in srgb, var(--ws-accent) 14%, var(--ws-surface-1)); }
}

.screen-share-avatar-wrap { position: relative; overflow: visible; }
.screen-share-live-indicator { position: absolute; top: -16px; right: 50%; z-index: 2; display: inline-flex; align-items: center; gap: 4px; min-height: 17px; padding: 3px 6px 3px 4px; color: var(--ws-accent); border: 1px solid color-mix(in srgb, var(--ws-accent) 28%, var(--ws-line)); border-radius: 999px; background: var(--ws-surface-1); box-shadow: 0 4px 12px color-mix(in srgb, var(--ws-fg) 12%, transparent); font-size: 8px; font-weight: 800; line-height: 1; white-space: nowrap; transform: translateX(50%); }
.screen-share-live-indicator::before { content: ""; width: 5px; height: 5px; flex: 0 0 5px; border-radius: 50%; background: var(--ws-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ws-success) 18%, transparent); animation: screen-share-live-dot 1.2s ease-in-out infinite; }
.screen-share-wave { display: inline-flex; align-items: center; gap: 1px; height: 14px; color: var(--ws-accent); }
.screen-share-wave i { display: block; width: 2px; flex: 0 0 2px; border-radius: 99px; background: currentColor; animation: screen-share-wave 1.1s ease-in-out infinite alternate; }
.screen-share-wave i:nth-child(2n) { animation-delay: -.18s; }
.screen-share-wave i:nth-child(3n) { animation-delay: -.42s; }
.screen-share-wave i:nth-child(4n) { animation-delay: -.66s; }
.screen-share-stop-button { position: absolute; bottom: -4px; left: -5px; z-index: 3; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; color: var(--ws-danger); border: 2px solid var(--ws-surface-1); border-radius: 7px; background: var(--ws-surface-2); box-shadow: 0 3px 9px color-mix(in srgb, var(--ws-fg) 18%, transparent); cursor: pointer; }
.screen-share-stop-button:hover { color: var(--ws-accent-fg); border-color: var(--ws-danger); background: var(--ws-danger); }
.screen-share-stop-button:focus-visible { outline: 3px solid color-mix(in srgb, var(--ws-danger) 42%, transparent); outline-offset: 2px; }
.screen-share-card-actions { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; min-width: 0; margin-top: 9px; flex-wrap: wrap; }
.screen-share-start-actions { display: inline-flex; align-items: stretch; justify-content: center; gap: 4px; width: 100%; min-width: 0; }
.screen-share-card-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 0; min-height: 25px; max-width: 100%; padding: 4px 7px; overflow: hidden; color: var(--ws-accent); border: 1px solid color-mix(in srgb, var(--ws-accent) 25%, var(--ws-line)); border-radius: 999px; background: color-mix(in srgb, var(--ws-accent) 8%, var(--ws-surface-1)); font-size: 9px; font-weight: 700; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.screen-share-card-button:hover { background: color-mix(in srgb, var(--ws-accent) 15%, var(--ws-surface-1)); }
.screen-share-card-button.viewing { color: var(--ws-accent-fg); border-color: var(--ws-accent); background: var(--ws-accent); }
.screen-share-settings-button { display: grid; place-items: center; width: 25px; min-width: 25px; min-height: 25px; padding: 0; color: var(--ws-fg-muted); border: 1px solid var(--ws-line); border-radius: 50%; background: var(--ws-surface-1); cursor: pointer; }
.screen-share-settings-button:hover, .screen-share-settings-button[aria-expanded="true"] { color: var(--ws-accent); border-color: color-mix(in srgb, var(--ws-accent) 35%, var(--ws-line)); background: color-mix(in srgb, var(--ws-accent) 9%, var(--ws-surface-1)); }
@keyframes screen-share-wave { 0% { transform: scaleY(.45); opacity: .5; } 100% { transform: scaleY(1); opacity: 1; } }
@media (max-width: 740px) {
  .screen-share-live-indicator { top: -14px; font-size: 7px; }
  .screen-share-card-button { font-size: 8px; }
}
</style>
