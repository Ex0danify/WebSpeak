<template>
  <div class="mt-4.5 min-h-0 flex-1 overflow-y-auto pr-0.75 compact:max-medium:mt-2.5 max-compact:mt-3 max-compact:flex-auto max-compact:pr-0.5 max-compact:pb-1 max-compact:[scrollbar-gutter:stable]">
    <section v-for="channelItem in channels" :key="channelItem.id" :class="['not-first:mt-2', dragOverChannelId === channelItem.id ? 'rounded-lg border border-dashed border-accent bg-accent/7 p-1.5 pb-3' : 'border-b border-line pt-2 pb-3.5 max-compact:pt-1.75 max-compact:pb-3']" :data-member-channel-id="channelItem.id" :style="{ marginLeft: `${channelItem.depth * 10}px` }" @dragover="$emit('channel-drag-over', channelItem, $event)" @dragleave="$emit('channel-drag-leave', channelItem, $event)" @drop="$emit('channel-drop', channelItem, $event)" @pointermove="$emit('member-pointer-move', $event)" @pointerup="$emit('member-pointer-up', $event)" @pointercancel="$emit('member-pointer-cancel', $event)">
      <Button variant="soft" size="row" :aria-current="isActive(channelItem) ? 'true' : undefined" :title="t('switchChannel')" @click="$emit('select-channel', channelItem)">
        <Icon name="volume" :size="16" />
        <span class="min-w-0 flex-1 truncate text-md font-bold">{{ channelNameText(channelItem, t) }}</span>
        <small class="text-ui">{{ channelItem.members.length }}</small>
      </Button>
      <div v-if="channelItem.members.length" class="mt-2.25 mr-1 ml-3.5 flex flex-col gap-3.25">
        <MemberRow
          v-for="member in channelItem.members"
          :key="`${channelItem.id}-${member.id}`"
          :member="member"
          :speaking="isSpeaking(member, speakingIds)"
          :volume="volumes[member.id] ?? 1"
          :is-mobile-viewport="isMobileViewport"
          :class="{ dragging: draggedMemberId === member.id }"
          :draggable="!member.isSelf"
          @dragstart="$emit('member-drag-start', member, $event)"
          @dragend="$emit('member-drag-end')"
          @pointerdown="$emit('member-pointer-down', member, $event)"
          @pointermove="$emit('member-pointer-move', $event)"
          @pointerup="$emit('member-pointer-up', $event)"
          @pointercancel="$emit('member-pointer-cancel', $event)"
          @contextmenu.prevent="$emit('open-member-menu', member, $event)"
          @open-actions="$emit('open-member-actions', member)"
          @set-volume="$emit('set-volume', member.id, $event)"
        />
      </div>
      <div v-else class="mt-1.75 mr-1 ml-7.75 text-caption text-fg-muted">{{ t('noMembersInChannel') }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import MemberRow from "./MemberRow.vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { channelNameText, isSpeaking } from "@/features/session";
import type { TreeChannel } from "../roomTypes.js";
import type { ChannelMember } from "@/features/session";

const props = defineProps<{
  channels: TreeChannel[];
  currentChannelId: string | undefined;
  dragOverChannelId: string;
  draggedMemberId: number | undefined;
  speakingIds: Set<number>;
  volumes: Record<number, number>;
  isMobileViewport: boolean;
}>();

defineEmits<{
  (e: "select-channel", channel: TreeChannel): void;
  (e: "channel-drag-over", channel: TreeChannel, event: DragEvent): void;
  (e: "channel-drag-leave", channel: TreeChannel, event: DragEvent): void;
  (e: "channel-drop", channel: TreeChannel, event: DragEvent): void;
  (e: "member-drag-start", member: ChannelMember, event: DragEvent): void;
  (e: "member-drag-end"): void;
  (e: "member-pointer-down", member: ChannelMember, event: PointerEvent): void;
  (e: "member-pointer-move", event: PointerEvent): void;
  (e: "member-pointer-up", event: PointerEvent): void;
  (e: "member-pointer-cancel", event: PointerEvent): void;
  (e: "open-member-menu", member: ChannelMember, event: MouseEvent): void;
  (e: "open-member-actions", member: ChannelMember): void;
  (e: "set-volume", memberId: number, volume: number): void;
}>();

const { t } = useI18n();

// The heading is highlighted for the joined channel and for the channel a member is dragged over.
const isActive = (channel: TreeChannel) => props.currentChannelId === channel.id || props.dragOverChannelId === channel.id;
</script>
