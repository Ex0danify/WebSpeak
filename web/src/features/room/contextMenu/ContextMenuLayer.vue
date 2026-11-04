<template>
  <Menu
    :open="Boolean(target)"
    :label="label"
    :close-label="t('close')"
    @update:open="(value) => !value && $emit('close')"
    @close-auto-focus="$emit('close-auto-focus', $event)"
  >
    <template #trigger><span class="fixed size-0" :style="menuStyle" aria-hidden="true"></span></template>
    <template v-if="target">
      <MemberMenuItems v-if="target.kind === 'member'" v-bind="memberProps" :member="target.member" v-on="memberListeners" />
      <SelfMenuItems v-else-if="target.kind === 'self'" :member="target.member" />
      <ChannelMenuItems
        v-else
        :channel="target.channel"
        :current="target.channel.id === currentChannelId"
        @switch="$emit('switch-channel', $event)"
        @copy-name="$emit('copy-channel-name', $event)"
      />
    </template>
  </Menu>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Menu } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { channelNameText, nicknameText, type ChannelMember } from "@/features/session";
import type { TreeChannel } from "@/features/room/roomTypes.js";
import ChannelMenuItems from "@/features/room/contextMenu/ChannelMenuItems.vue";
import MemberMenuItems from "@/features/room/contextMenu/MemberMenuItems.vue";
import SelfMenuItems from "@/features/room/contextMenu/SelfMenuItems.vue";
import type { ContextTarget } from "@/features/room/contextMenu/useContextMenu.js";

// One menu for the whole room. The target says which items it shows, the Menu around them is shared.
const props = defineProps<{
  target: ContextTarget | null;
  menuStyle: { left?: string; top?: string };
  currentChannelId: string | undefined;
  moveCurrentChannel: TreeChannel | null;
  moveCurrentSameChannel: boolean;
  moveOtherChannels: TreeChannel[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "close-auto-focus", event: Event): void;
  (e: "private-message", id: number): void;
  (e: "poke", member: ChannelMember): void;
  (e: "toggle-whisper", member: ChannelMember): void;
  (e: "copy-name", member: ChannelMember): void;
  (e: "move", member: ChannelMember, channelId: string): void;
  (e: "switch-channel", channel: TreeChannel): void;
  (e: "copy-channel-name", channel: TreeChannel): void;
}>();

const { t } = useI18n();

const label = computed(() => {
  const current = props.target;
  if (!current) return undefined;
  return current.kind === "channel"
    ? channelNameText(current.channel, t)
    : nicknameText(current.member.nickname, t, current.member.unnamed);
});

const memberProps = computed(() => ({
  moveCurrentChannel: props.moveCurrentChannel,
  moveCurrentSameChannel: props.moveCurrentSameChannel,
  moveOtherChannels: props.moveOtherChannels,
}));

const memberListeners = {
  "private-message": (id: number) => emit("private-message", id),
  poke: (member: ChannelMember) => emit("poke", member),
  "toggle-whisper": (member: ChannelMember) => emit("toggle-whisper", member),
  "copy-name": (member: ChannelMember) => emit("copy-name", member),
  move: (member: ChannelMember, channelId: string) => emit("move", member, channelId),
};
</script>
