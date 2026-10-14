<template>
  <div class="relative">
    <template v-if="elbow">
      <span
        aria-hidden="true"
        :class="['pointer-events-none absolute top-0 h-1/2 w-px', toneClass(elbow.vertical)]"
        :style="{ right: 'calc(100% + var(--spacing-tree-step) / 2)' }"
      ></span>
      <span
        aria-hidden="true"
        :class="['pointer-events-none absolute top-1/2 right-full h-px', toneClass(elbow.stub)]"
        :style="{ width: 'calc(var(--spacing-tree-step) / 2)' }"
      ></span>
    </template>
    <Button variant="soft" size="row" :aria-current="active ? 'true' : undefined" :title="t('switchChannel')">
      <Icon name="volume" :size="sub ? 14 : 16" />
      <span :class="['min-w-0 flex-1 truncate', sub ? 'text-ui font-medium' : 'text-md font-bold']">{{ channelNameText(channel, t) }}</span>
      <small class="text-ui">{{ channel.members.length }}</small>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { channelNameText } from "@/features/session";
import type { TreeChannel } from "../roomTypes.js";
import type { ChannelRailState, RailTone } from "./channelRails.js";

const props = defineProps<{
  channel: TreeChannel;
  active: boolean;
  /** The upper half of this row's rail and the stub into its name; absent for roots. */
  elbow?: ChannelRailState["elbow"];
}>();

const { t } = useI18n();

const sub = computed(() => props.channel.rootId !== props.channel.id);
const toneClass = (tone: RailTone) => (tone === "accent" ? "bg-accent" : "bg-line");
</script>
