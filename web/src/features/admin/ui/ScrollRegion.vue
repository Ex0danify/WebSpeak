<template>
  <div role="region" tabindex="0" :aria-label="label" :class="cn('min-w-0', height[size], props.class)"><slot /></div>
</template>

<script setup lang="ts">
import { cn } from "@/shared/lib/cn";

// A list that can grow without end (sessions, invites, logs, audit) stops at a height on a desktop and scrolls inside itself,
// the keyboard reaches it by its tab stop. On a phone it flows with the page, so there is no scroll inside the scroll.
const props = withDefaults(defineProps<{ label: string; size?: "none" | "sm" | "md" | "lg"; class?: string }>(), { size: "md" });

// `none` has no height of its own, only a sideways scroll for a table wider than the card.
const height = {
  none: "overflow-x-auto",
  sm: "desktop:max-h-64 desktop:overflow-auto",
  md: "desktop:max-h-96 desktop:overflow-auto",
  lg: "desktop:max-h-128 desktop:overflow-auto",
};
</script>
