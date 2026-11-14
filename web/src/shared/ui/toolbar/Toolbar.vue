<script setup lang="ts">
import { ToolbarRoot } from "reka-ui";
import { cn } from "@/shared/lib/cn";

// A row of related controls that count as one tab stop: Tab enters it, the arrow keys move inside it, Home and End jump to
// the ends. Give it `label`, put ToolbarButton, ToolbarItem and ToolbarSeparator in it. `class` styles the row.
const props = defineProps<{ label: string; class?: string }>();
</script>

<template>
  <ToolbarRoot :aria-label="label" orientation="horizontal" :class="cn('flex flex-wrap items-center gap-0.5', props.class)">
    <slot />
  </ToolbarRoot>
</template>
