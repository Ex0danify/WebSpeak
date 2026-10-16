<template>
  <div aria-hidden="true" class="pointer-events-none">
    <span
      v-for="line in lines"
      :key="line.column"
      :class="['absolute inset-y-0 w-px', line.tone === 'accent' ? 'bg-accent' : 'bg-line']"
      :style="{ left: `calc(var(--spacing-tree-step) * ${line.column - 0.5})` }"
    ></span>
  </div>
</template>

<script setup lang="ts">
import type { ChannelRailState } from "@/features/room/members/channelRails.js";

defineProps<{
  /** Full-height verticals, positioned from the left edge of the positioned parent. */
  lines: ChannelRailState["through"];
}>();
</script>
