<template>
  <VoiceTile :speaking="speaking">
    <Tooltip :text="t('moreMemberOptions')"
      ><Button
        v-if="isMobileViewport && !member.isSelf"
        variant="soft"
        icon-only
        class="absolute top-1.75 right-1.75 hidden max-compact:inline-flex"
        :aria-label="t('moreMemberOptions')"
        @click.stop="$emit('open-actions')"
        ><Icon name="more" :size="17" /></Button
    ></Tooltip>
    <div class="relative mx-auto mb-2.75 w-17 max-compact:mb-2.5 max-compact:w-15">
      <Avatar :name="member.nickname" :src="member.avatar || undefined" size="tile" tint :self="member.isSelf" :speaking="speaking" />
      <AvatarMuteBadge v-if="mutedLocally" size="tile" :label="t('mutedLocally')" />
      <span v-if="stream" :class="liveBadge"
        ><span class="inline-flex h-3.5 items-center gap-px text-accent" aria-hidden="true"
          ><i
            v-for="(bar, index) in screenShareIndicatorBars"
            :key="bar"
            class="block w-0.5 flex-none animate-share-wave rounded-full bg-current motion-reduce:animate-none"
            :style="{ height: `${bar}px`, animationDelay: waveDelay(index) }"
          ></i></span
        ><span>{{ t("sharingScreen") }}</span></span
      >
      <Tooltip :text="t('stopScreenShare')"
        ><Button
          v-if="member.isSelf && (screenShareActive || screenShareStarting)"
          variant="dangerSoft"
          size="xs"
          icon-only
          class="absolute -bottom-1 -left-1.25 z-3"
          :aria-label="t('stopScreenShare')"
          @click.stop="$emit('stop-screen-share')"
          ><Icon name="close" :size="14" /></Button
      ></Tooltip>
    </div>
    <strong :class="voiceTileNameClass">{{ member.isSelf ? t("you") : nicknameText(member.nickname, t, member.unnamed) }}</strong
    ><span :class="voiceTileStatusVariants({ speaking })">{{
      speaking ? t("speaking") : member.isSelf ? t("connectedYou") : t("connected")
    }}</span>
    <div v-if="member.isSelf || stream" class="mt-2.25 flex w-full min-w-0 flex-wrap items-center justify-center gap-1.25">
      <template v-if="member.isSelf && !screenShareActive && !screenShareStarting">
        <div class="inline-flex w-full min-w-0 items-stretch justify-center gap-1">
          <Button variant="pill" size="xs" class="max-w-full min-w-0 truncate" @click.stop="$emit('start-screen-share')"
            ><Icon name="monitor" :size="13" /> {{ t("startScreenShare") }}</Button
          >
          <Tooltip :text="t('screenShareSettings')"
            ><Button
              variant="outline"
              size="xs"
              icon-only
              :aria-label="t('screenShareSettings')"
              :aria-expanded="screenShareSettingsOpen"
              @click.stop="screenShareSettingsOpen = !screenShareSettingsOpen"
              ><Icon name="settings" :size="13" /></Button
          ></Tooltip>
        </div>
      </template>
      <Button
        v-else-if="!member.isSelf"
        :variant="screenShareViewingStreamId === stream?.streamId ? 'primary' : 'pill'"
        size="xs"
        class="max-w-full min-w-0 truncate"
        @click.stop="$emit('toggle-screen-share')"
        ><Icon name="monitor" :size="13" />
        {{ screenShareViewingStreamId === stream?.streamId ? t("watching") : t("watchScreenShare") }}</Button
      >
    </div>
  </VoiceTile>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { Avatar, AvatarMuteBadge } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { VoiceTile, voiceTileNameClass, voiceTileStatusVariants } from "@/shared/ui/voiceTile";
import { nicknameText, type ChannelMember } from "@/features/session";
import type { ScreenShareStream } from "@/features/screenShare";

defineProps<{
  member: ChannelMember;
  speaking: boolean;
  /** The local user muted this member on this client. */
  mutedLocally?: boolean;
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

const liveBadge =
  "absolute -top-4 right-1/2 z-2 inline-flex min-h-4.25 translate-x-1/2 items-center gap-1 rounded-full border border-accent/25 bg-surface-1 py-0.75 pr-1.5 pl-1 text-2xs leading-none font-extrabold whitespace-nowrap text-accent shadow-sm before:size-1.25 before:flex-none before:animate-live-dot before:rounded-full before:bg-success before:ring-3 before:ring-success/20 before:content-[''] motion-reduce:before:animate-none max-compact:-top-3.5";

// Staggered start so the bars of the sharing badge do not move in lockstep (index is 0-based, the pattern is 1-based).
function waveDelay(index: number): string {
  const n = index + 1;
  return n % 4 === 0 ? "-0.66s" : n % 3 === 0 ? "-0.42s" : n % 2 === 0 ? "-0.18s" : "0s";
}
</script>
