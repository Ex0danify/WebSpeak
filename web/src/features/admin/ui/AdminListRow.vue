<template>
  <component :is="as" :class="cn('rounded-md bg-surface-0', padding[size], props.class)"><slot /></component>
</template>

<script setup lang="ts">
import { cn } from "@/shared/lib/cn";

// One row of a list inside a card: the quiet surface the lists of the console share. The layout inside it is the caller's `class`.
const props = withDefaults(defineProps<{ as?: "div" | "li"; size?: "sm" | "md" | "lg"; class?: string }>(), { as: "div", size: "md" });

const padding = { sm: "p-2", md: "p-2.5", lg: "p-3.25" };
</script>
