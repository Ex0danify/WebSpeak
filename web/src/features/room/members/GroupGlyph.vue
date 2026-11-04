<template>
  <span class="inline-flex size-4 shrink-0 items-center justify-center">
    <img v-if="group.src" :src="group.src" alt="" draggable="false" class="size-4 object-contain" />
    <Icon v-else-if="group.builtin" :name="group.builtin.icon" :size="14" :class="group.builtin.tone" />
  </span>
</template>

<script setup lang="ts">
import type { MemberGroup } from "@/features/room/members/useMemberGroups.js";
import { Icon } from "@/shared/ui/icon";

// The icon of a group. The caller names it for screen readers.
defineProps<{ group: MemberGroup }>();
</script>
