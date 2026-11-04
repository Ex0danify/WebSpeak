<template>
  <div
    ref="row"
    :data-member-id="member.id"
    :tabindex="isMobileViewport ? undefined : 0"
    :class="[
      'group/row relative -mx-1.5 -my-0.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-0.5 transition-[background-color,box-shadow] duration-150 focus-within:bg-accent-soft focus-within:shadow-sm hover:bg-accent-soft hover:shadow-sm max-compact:m-0 max-compact:min-h-14.5 max-compact:gap-2.25 max-compact:rounded-lg max-compact:p-1.75 [&.dragging]:opacity-45 [&[draggable=true]]:touch-none',
      grabbing ? 'cursor-grabbing' : 'cursor-context-menu',
    ]"
    @contextmenu.prevent="openMenu($event)"
    @pointerdown="onPointerDown"
    @pointerup="grabbing = false"
    @pointercancel="grabbing = false"
    @dragend="grabbing = false"
  >
    <span class="relative shrink-0"
      ><Avatar
        :name="member.nickname"
        :src="member.avatar || undefined"
        :speaking="speaking"
        size="row"
        tint
        :self="member.isSelf"
        surface="surface-1"
        class="size-6.5 group-focus-within/row:[--avatar-gap:var(--color-surface-2)] group-hover/row:[--avatar-gap:var(--color-surface-2)] max-compact:size-10" /><AvatarMuteBadge
        v-if="mutedLocally"
        :label="t('mutedLocally')" /><AvatarMuteBadge
        v-else-if="talkBlocked"
        :label="t('noTalkPower')"
        icon="mic-off"
        tone="warning" /><span
        v-else
        :class="[
          'absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-surface-1 max-compact:size-2.5',
          member.away ? 'bg-warning' : 'bg-success',
        ]"
        aria-hidden="true"
      ></span
    ></span>
    <div class="min-w-0 flex-1 *:block *:truncate">
      <strong class="text-ui text-fg max-compact:text-sm">{{ memberDisplayName(member, t) }}</strong
      ><span
        class="mt-0 text-caption leading-tight text-fg-muted max-compact:mt-0.75 max-compact:text-xs"
        :title="member.away && member.awayMessage ? member.awayMessage : undefined"
        ><template v-if="member.away"
          >{{ t("away") }}<template v-if="member.awayMessage"> · {{ member.awayMessage }}</template></template
        ><template v-else>{{ speaking ? t("speaking") : member.isSelf ? t("yourDevice") : t("memberOnline") }}</template></span
      >
    </div>
    <div role="group" :aria-label="t('memberStates')" class="max-compact:hidden">
      <span v-if="member.inputMuted" role="img" :title="t('inputMuted')" :aria-label="t('inputMuted')"
        ><Icon name="mic-off" :size="13" /></span
      ><span v-if="member.outputMuted" role="img" :title="t('outputMuted')" :aria-label="t('outputMuted')"
        ><Icon name="volume-off" :size="13" /></span
      ><span v-if="member.channelCommander" role="img" :title="t('channelCommander')" :aria-label="t('channelCommander')"
        ><Icon name="shield" :size="13"
      /></span>
    </div>
    <span v-if="stream || member.streaming" :class="liveBadge"
      ><span class="inline-flex h-3 items-center gap-px text-accent" aria-hidden="true"
        ><i
          v-for="(bar, index) in indicatorBars"
          :key="index"
          class="block w-0.5 flex-none animate-share-wave rounded-full bg-current motion-reduce:animate-none"
          :style="{ height: `${Math.min(bar, 12)}px`, animationDelay: waveDelay(index) }"
        ></i></span
      >{{ t("sharingScreen") }}</span
    >
    <Tooltip v-if="stream && !member.isSelf" :text="t('watchScreenShare')"
      ><Button
        :variant="watching ? 'primary' : 'pill'"
        size="xs"
        icon-only
        class="flex-none"
        :pressed="watching"
        pressed-tone="none"
        :aria-label="t('watchScreenShare')"
        @click.stop="$emit('toggle-screen-share')"
        @pointerdown.stop
        ><Icon name="monitor" :size="13" /></Button
    ></Tooltip>
    <MemberGroupIcons :groups="groups" />
    <Tooltip :text="t('moreMemberOptions')"
      ><Button
        v-if="isMobileViewport && !member.isSelf"
        variant="soft"
        icon-only
        class="flex-none"
        :aria-label="t('moreMemberOptions')"
        @click.stop="row && openMenu(row)"
        ><Icon name="more" :size="18" /></Button
    ></Tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useContextMenuOpener } from "@/features/room/contextMenuApi.js";
import MemberGroupIcons from "@/features/room/members/MemberGroupIcons.vue";
import type { MemberGroups } from "@/features/room/members/useMemberGroups.js";
import { Avatar, AvatarMuteBadge } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { memberDisplayName } from "@/features/session";
import type { ChannelMember } from "@/features/session";
import type { ScreenShareStream } from "@/features/screenShare";

const props = withDefaults(
  defineProps<{
    member: ChannelMember;
    speaking: boolean;
    /** Our own voice is dropped in this channel (moderated, not enough talk power). */
    talkBlocked?: boolean;
    /** The local user muted this member on this client. */
    mutedLocally?: boolean;
    isMobileViewport: boolean;
    /** The screen share this member owns, if any. */
    stream?: ScreenShareStream | null;
    /** The local user is watching that stream. */
    watching?: boolean;
    indicatorBars?: number[];
    /** The groups of this member that have an icon. */
    groups?: MemberGroups;
  }>(),
  { stream: null, watching: false, indicatorBars: () => [], groups: () => ({ server: [] }) },
);

defineEmits<{
  (e: "toggle-screen-share"): void;
}>();

const { t } = useI18n();
const openContextMenu = useContextMenuOpener();
const row = ref<HTMLElement | null>(null);
const openMenu = (origin: Event | HTMLElement) =>
  openContextMenu(props.member.isSelf ? "self" : "member", { member: props.member }, origin);

// CSS :active also matches a right click, which would flash the grab cursor before the context menu opens.
const grabbing = ref(false);
function onPointerDown(e: PointerEvent) {
  grabbing.value = e.button === 0 && (e.currentTarget as HTMLElement).getAttribute("draggable") === "true";
}

const liveBadge =
  "inline-flex flex-none items-center gap-1 rounded-full border border-accent/25 bg-accent/8 py-px pr-1.5 pl-1 text-2xs leading-tight font-bold text-accent";

// Staggered start so the bars do not move in lockstep.
function waveDelay(index: number): string {
  const n = index + 1;
  return n % 4 === 0 ? "-0.66s" : n % 3 === 0 ? "-0.42s" : n % 2 === 0 ? "-0.18s" : "0s";
}
</script>
