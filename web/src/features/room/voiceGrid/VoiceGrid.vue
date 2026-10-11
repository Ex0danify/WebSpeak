<template>
  <div v-if="currentMembers.length" class="mt-4.25 grid grid-cols-[repeat(auto-fill,minmax(142px,1fr))] gap-3 max-compact:mt-3.5 max-compact:grid-cols-2 max-compact:gap-2.5">
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
    <VoiceTile v-if="currentMembers.length > roomMembers.length" class="grid place-content-center place-items-center">
      <div class="mb-2.75 grid size-13.5 place-items-center rounded-full bg-accent-soft text-flag font-bold text-accent">+{{ currentMembers.length - roomMembers.length }}</div>
      <strong :class="voiceTileNameClass">{{ t('moreMembers') }}</strong>
      <span :class="voiceTileStatusVariants()">{{ t('viewLeft') }}</span>
    </VoiceTile>
  </div>
  <div v-else class="mt-4.25 flex items-center gap-2.75 rounded-lg border border-dashed border-line p-4.5 text-sm text-fg-muted">
    <span class="grid size-8.5 place-items-center rounded-lg bg-accent-soft text-accent"><Icon name="users" :size="20" /></span>
    <strong>{{ t('waitingForMembers') }}</strong>
    <span class="ml-auto">{{ t('prepareMicrophone') }}</span>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import VoiceCard from "./VoiceCard.vue";
import { VoiceTile, voiceTileNameClass, voiceTileStatusVariants } from "@/shared/ui/voiceTile";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { isSpeaking } from "@/features/session";
import type { ChannelMember } from "@/features/session";
import type { ScreenShareStream } from "@/features/screenShare";

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
