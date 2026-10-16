<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/icon";
import { chipVariants, type ChipVariants } from "@/shared/ui/chip/chip";

const props = withDefaults(
  defineProps<{
    variant?: ChipVariants["variant"];
    size?: ChipVariants["size"];
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
  <span :class="cn(chipVariants({ variant, size }), props.class)">
    <span v-if="$slots.icon || needsIcon" class="relative inline-flex shrink-0" aria-hidden="true">
      <slot name="icon"><Icon name="alert" :size="13" /></slot>
    </span>
    <span v-else-if="dot" class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
    <span class="relative min-w-0 truncate"><slot /></span>
  </span>
</template>
