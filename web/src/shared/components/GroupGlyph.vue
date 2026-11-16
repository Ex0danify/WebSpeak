<template>
  <span class="inline-flex size-4 shrink-0 items-center justify-center">
    <img v-if="group.src" :src="group.src" alt="" draggable="false" class="size-4 object-contain" />
    <Icon v-else-if="group.builtin" :name="group.builtin.icon" :size="14" :class="group.builtin.tone" />
  </span>
</template>

<script setup lang="ts">
import type { GroupIcon } from "@/shared/lib/builtinGroupIcons";
import { Icon } from "@/shared/ui/icon";

// The icon of a group, an empty square of the same size for one without, so a list of groups lines up. The caller names it for
// screen readers.
defineProps<{ group: GroupIcon }>();
</script>
