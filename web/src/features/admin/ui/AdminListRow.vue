<template>
  <component
    :is="as"
    :class="cn('bg-surface-0', bordered ? 'rounded-lg border border-line p-3' : ['rounded-md', padding[size]], props.class)"
    ><slot
  /></component>
</template>

<script setup lang="ts">
import { cn } from "@/shared/lib/cn";

// One row of a list inside a card: the quiet surface the lists of the console share. The layout inside it is the caller's `class`.
// An entry of a list the person scrolls through (events, invites, connections) is `bordered`, a tile of facts is not.
const props = withDefaults(defineProps<{ as?: "div" | "li"; size?: "sm" | "md" | "lg"; bordered?: boolean; class?: string }>(), {
  as: "div",
  size: "md",
  bordered: false,
});

const padding = { sm: "p-2", md: "p-2.5", lg: "p-3.25" };
</script>
