<template>
  <div
    :data-member-id="member.id"
    :tabindex="isMobileViewport || member.isSelf ? undefined : 0"
    class="group/row relative -mx-1.5 -my-0.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-0.5 transition-[background-color,box-shadow] duration-150 focus-within:bg-accent-soft focus-within:shadow-sm hover:bg-accent-soft hover:shadow-sm max-compact:m-0 max-compact:min-h-14.5 max-compact:gap-2.25 max-compact:rounded-lg max-compact:p-1.75 [&.dragging]:opacity-45 [&[draggable=true]]:cursor-grab [&[draggable=true]]:touch-none [&[draggable=true]:active]:cursor-grabbing"
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
        class="size-6.5 group-focus-within/row:[--avatar-gap:var(--color-surface-2)] group-hover/row:[--avatar-gap:var(--color-surface-2)] max-compact:size-10" /><span
        class="absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-surface-1 bg-success max-compact:size-2.5"
        aria-hidden="true"
      ></span
    ></span>
    <div class="min-w-0 flex-1 *:block *:truncate">
      <strong class="text-ui text-fg max-compact:text-sm">{{ memberDisplayName(member, t) }}</strong
      ><span class="mt-0 text-caption leading-tight text-fg-muted max-compact:mt-0.75 max-compact:text-xs">{{
        member.away ? t("away") : speaking ? t("speaking") : member.isSelf ? t("yourDevice") : t("memberOnline")
      }}</span>
    </div>
    <div role="group" :aria-label="t('memberStates')" class="max-compact:hidden">
      <span v-if="member.away" role="img" :title="t('away')" :aria-label="t('away')"><Icon name="clock" :size="13" /></span
      ><span v-if="member.inputMuted" role="img" :title="t('inputMuted')" :aria-label="t('inputMuted')"
        ><Icon name="mic-off" :size="13" /></span
      ><span v-if="member.outputMuted" role="img" :title="t('outputMuted')" :aria-label="t('outputMuted')"
        ><Icon name="volume-off" :size="13" /></span
      ><span v-if="member.channelCommander" role="img" :title="t('channelCommander')" :aria-label="t('channelCommander')"
        ><Icon name="shield" :size="13"
      /></span>
    </div>
    <Tooltip :text="t('moreMemberOptions')"
      ><Button
        v-if="isMobileViewport && !member.isSelf"
        variant="soft"
        icon-only
        class="flex-none"
        :aria-label="t('moreMemberOptions')"
        @click.stop="$emit('open-actions')"
        ><Icon name="more" :size="18" /></Button
    ></Tooltip>
  </div>
</template>

<script setup lang="ts">
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { memberDisplayName } from "@/features/session";
import type { ChannelMember } from "@/features/session";

defineProps<{
  member: ChannelMember;
  speaking: boolean;
  isMobileViewport: boolean;
}>();

defineEmits<{
  (e: "open-actions"): void;
}>();

const { t } = useI18n();
</script>
