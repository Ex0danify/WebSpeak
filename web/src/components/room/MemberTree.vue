<template>
  <div class="member-tree">
    <section v-for="channelItem in channels" :key="channelItem.id" :class="['member-channel-group', { current: currentChannelId === channelItem.id, 'drag-over': dragOverChannelId === channelItem.id }]" :data-member-channel-id="channelItem.id" :style="{ marginLeft: `${channelItem.depth * 10}px` }" @dragover="$emit('channel-drag-over', channelItem, $event)" @dragleave="$emit('channel-drag-leave', channelItem, $event)" @drop="$emit('channel-drop', channelItem, $event)" @pointermove="$emit('member-pointer-move', $event)" @pointerup="$emit('member-pointer-up', $event)" @pointercancel="$emit('member-pointer-cancel', $event)">
      <button class="member-channel-heading" :title="t('switchChannel')" @click="$emit('select-channel', channelItem)">
        <Icon name="volume" :size="16" />
        <span>{{ channelItem.name }}</span>
        <small>{{ channelItem.members.length }}</small>
      </button>
      <div v-if="channelItem.members.length" class="member-list">
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
      <div v-else class="channel-no-members">{{ t('noMembersInChannel') }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@/components/ui/icon";
import MemberRow from "./MemberRow.vue";
import { useI18n } from "@/i18n/use-i18n.js";
import { isSpeaking } from "@/lib/format.js";
import type { TreeChannel } from "@/composables/useChannelTree.js";
import type { ChannelMember } from "@/composables/useVoiceWebSocket.js";

defineProps<{
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
</script>

<style scoped>
.member-list { display: flex; flex-direction: column; gap: 17px; margin-top: 17px; }
.member-tree { flex: 1; min-height: 0; margin-top: 18px; padding-right: 3px; overflow-y: auto; }
.member-channel-group { padding: 8px 0 14px; border-bottom: 1px solid var(--ws-line); }
.member-channel-group + .member-channel-group { margin-top: 8px; }
.member-channel-heading { display: flex; align-items: center; gap: 7px; width: 100%; padding: 5px 4px; color: var(--ws-fg-muted); background: transparent; border-radius: 7px; text-align: left; cursor: pointer; }
.member-channel-heading:hover, .member-channel-group.current .member-channel-heading { color: var(--ws-accent); background: var(--ws-accent-soft); }
.member-channel-heading span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
.member-channel-heading small { color: var(--ws-fg-muted); font-size: 10px; }
.member-channel-group.current .member-channel-heading small { color: var(--ws-accent); }
.member-channel-group .member-list { gap: 13px; margin: 9px 4px 0 14px; }
.channel-no-members { margin: 7px 4px 0 31px; color: var(--ws-fg-muted); font-size: 10px; }
.app-shell .member-channel-heading span { font-size: 15px; }
.app-shell .member-channel-heading small { font-size: 12.5px; }
.app-shell .channel-no-members { font-size: 11.25px; }
@media (max-width: 980px) {
  .member-tree { margin-top: 10px; }
}
@media (max-width: 740px) {
  .app-shell .member-panel .member-tree { max-height: none; }
}
@media (max-width: 740px) {
  .app-shell .member-panel .member-tree { flex: 1 1 auto; min-height: 0; max-height: none; margin-top: 12px; padding: 0 2px 4px 0; overflow-y: auto; scrollbar-gutter: stable; }
  .member-channel-group { padding: 7px 0 12px; }
  .member-channel-heading { min-height: 44px; padding: 0 9px; border-radius: 11px; font-size: 14px; }
  .member-channel-heading small { font-size: 12px; }
  .member-list { gap: 3px; margin-top: 5px; }
}
.member-channel-group.drag-over { padding: 6px 6px 12px; border: 1px dashed var(--ws-accent); border-radius: 10px; background: color-mix(in srgb, var(--ws-accent) 7%, transparent); }
.member-channel-group.drag-over .member-channel-heading { color: var(--ws-accent); background: color-mix(in srgb, var(--ws-accent) 13%, var(--ws-surface-1)); }
</style>
