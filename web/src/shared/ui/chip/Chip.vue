<script setup lang="ts">
import { computed } from "vue";
import { cn } from "../../lib/cn";
import { Icon } from "../icon";
import { chipVariants, type ChipVariants } from "./chip";

const props = withDefaults(
  defineProps<{
    variant?: ChipVariants["variant"];
    /** Small status dot before the label. Ignored when an icon is shown. */
    dot?: boolean;
    class?: string;
  }>(),
  { dot: false },
);

// Warning and danger never rely on color alone: they always render an icon,
// the `icon` slot or a default alert glyph.
const needsIcon = computed(() => props.variant === "warning" || props.variant === "danger");
</script>

<template>
  <span :class="cn(chipVariants({ variant }), props.class)">
    <span v-if="$slots.icon || needsIcon" class="inline-flex shrink-0" aria-hidden="true">
      <slot name="icon"><Icon name="alert" :size="13" /></slot>
    </span>
    <span v-else-if="dot" class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
    <span class="min-w-0 truncate"><slot /></span>
  </span>
</template>
