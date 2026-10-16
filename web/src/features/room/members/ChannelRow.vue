<template>
  <div class="relative">
    <template v-if="elbow">
      <span
        aria-hidden="true"
        :class="['pointer-events-none absolute top-0 h-1/2 w-px', toneClass(elbow.vertical)]"
        :style="{ left: 'calc(var(--spacing-tree-step) / -2)' }"
      ></span>
      <span
        aria-hidden="true"
        :class="['pointer-events-none absolute top-1/2 right-full h-px', toneClass(elbow.stub)]"
        :style="{ width: 'calc(var(--spacing-tree-step) / 2)' }"
      ></span>
    </template>
    <Button variant="soft" size="row" :class="buttonClass" :aria-current="active ? 'true' : undefined" :title="t('switchChannel')">
      <Icon name="volume" :size="sub ? 14 : 16" />
      <span :class="['min-w-0 flex-1 truncate', sub ? ['text-ui', occupied ? 'font-bold' : 'font-medium'] : 'text-md font-bold']">{{
        channelNameText(channel, t)
      }}</span>
      <small v-if="channel.members.length" class="text-ui">{{ channel.members.length }}</small>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { channelNameText } from "@/features/session";
import type { TreeChannel } from "@/features/room/roomTypes.js";
import type { ChannelRailState, RailTone } from "@/features/room/members/channelRails.js";

const props = defineProps<{
  channel: TreeChannel;
  /** The channel you are in. */
  active: boolean;
  /** A member is being dragged over this row. */
  dragOver: boolean;
  /** The upper half of this row's rail and the stub into its name; absent for roots. */
  elbow?: ChannelRailState["elbow"];
}>();

const { t } = useI18n();

// Who is in the channel sets how prominent its name is: full text colour and weight when occupied, the muted colour when empty.
const occupied = computed(() => props.channel.members.length > 0);
const sub = computed(() => props.channel.rootId !== props.channel.id);
const buttonClass = computed(() =>
  props.dragOver
    ? "border-dashed border-accent bg-accent/7 text-accent aria-[current=true]:shadow-bar-accent"
    : ["aria-[current=true]:shadow-bar-accent", occupied.value && "text-fg"].filter(Boolean).join(" "),
);
const toneClass = (tone: RailTone) => (tone === "accent" ? "bg-accent" : "bg-line");
</script>
