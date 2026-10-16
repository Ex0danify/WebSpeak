<template>
  <div
    class="mt-4.5 min-h-0 flex-1 overflow-y-auto pr-0.75 max-compact:mt-3 max-compact:flex-auto max-compact:[scrollbar-gutter:stable] max-compact:pr-0.5 max-compact:pb-1 compact:max-medium:mt-2.5"
  >
    <template v-for="item in layout" :key="item.key">
      <SpacerRow v-if="item.spacer" :spacer="item.spacer" :depth="item.depth" />
      <div
        v-else
        :class="[
          'border-b border-line not-first:mt-2',
          isBareChannel(item.channels) ? 'py-1' : 'pt-2 pb-2 max-compact:pt-1.75 max-compact:pb-1.5',
        ]"
      >
        <template v-for="channelItem in item.channels" :key="channelItem.id">
          <section
            :class="[
              'relative',
              dragOverChannelId === channelItem.id && 'rounded-lg border border-dashed border-accent bg-accent/7 p-1.5 pb-3',
            ]"
            :data-member-channel-id="channelItem.id"
            :style="{ paddingLeft: `calc(var(--spacing-tree-step) * ${channelItem.depth})` }"
            @dragover="$emit('channel-drag-over', channelItem, $event)"
            @dragleave="$emit('channel-drag-leave', channelItem, $event)"
            @drop="$emit('channel-drop', channelItem, $event)"
            @pointermove="$emit('member-pointer-move', $event)"
            @pointerup="$emit('member-pointer-up', $event)"
            @pointercancel="$emit('member-pointer-cancel', $event)"
          >
            <ChannelRails :lines="rails.get(channelItem.id)?.through ?? []" />
            <ChannelRow
              :channel="channelItem"
              :active="currentChannelId === channelItem.id"
              :drag-over="dragOverChannelId === channelItem.id"
              :elbow="rails.get(channelItem.id)?.elbow"
              @click="$emit('select-channel', channelItem)"
            />
            <div :class="['relative', (channelItem.members.length || rails.get(channelItem.id)?.descent) && 'pb-1.5']">
              <ChannelRails v-if="rails.get(channelItem.id)?.descent" :lines="[{ column: 1, tone: rails.get(channelItem.id)!.descent! }]" />
              <div v-if="channelItem.members.length" class="mt-1.5 mr-1 ml-3.5 flex flex-col gap-2">
                <MemberRow
                  v-for="member in channelItem.members"
                  :key="`${channelItem.id}-${member.id}`"
                  :member="member"
                  :speaking="isSpeaking(member, speakingIds)"
                  :muted-locally="Boolean(mutedMembers[member.id])"
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
                />
              </div>
              <span v-else class="sr-only">{{ t("noMembersInChannel") }}</span>
            </div>
          </section>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ChannelRails from "./ChannelRails.vue";
import ChannelRow from "./ChannelRow.vue";
import { computeChannelRails } from "./channelRails.js";
import MemberRow from "./MemberRow.vue";
import { SpacerRow } from "@/shared/ui/spacer";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { isSpeaking } from "@/features/session";
import type { TreeChannel } from "../roomTypes.js";
import type { ChannelMember } from "@/features/session";

const props = defineProps<{
  channels: TreeChannel[];
  currentChannelId: string | undefined;
  dragOverChannelId: string;
  draggedMemberId: number | undefined;
  speakingIds: Set<number>;
  mutedMembers: Record<number, boolean>;
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
}>();

const { t } = useI18n();

type LayoutItem =
  | { key: string; spacer: NonNullable<TreeChannel["spacer"]>; depth: number; channels?: undefined }
  | { key: string; spacer?: undefined; depth?: undefined; channels: TreeChannel[] };

const rails = computed(() => computeChannelRails(props.channels, props.currentChannelId));

/** A lone channel with nobody in it: its block needs no breathing room. */
const isBareChannel = (channels: TreeChannel[]) => channels.length === 1 && channels[0]!.members.length === 0;

// A root and its subtree share one block with a single closing hairline; spacers stay between blocks.
const layout = computed(() => {
  const items: LayoutItem[] = [];
  for (const channel of props.channels) {
    if (channel.spacer) {
      items.push({ key: channel.id, spacer: channel.spacer, depth: channel.depth });
      continue;
    }
    const last = items.at(-1);
    if (last?.channels && last.key === channel.rootId) last.channels.push(channel);
    else items.push({ key: channel.rootId, channels: [channel] });
  }
  return items;
});
</script>
