<script setup lang="ts">
import { computed } from "vue";
import { Separator as RekaSeparator } from "reka-ui";
import { cn } from "../../lib/cn";

// A 1 px rule in the decorative `line` color. Decorative by default (hidden
// from assistive tech); pass `decorative: false` when it divides content
// that a screen reader user should hear as separate groups.
const props = withDefaults(
  defineProps<{
    orientation?: "horizontal" | "vertical";
    decorative?: boolean;
    class?: string;
  }>(),
  { orientation: "horizontal", decorative: true },
);

const classes = computed(() =>
  cn(
    "shrink-0 border-0 bg-line",
    props.orientation === "vertical" ? "w-px self-stretch" : "h-px w-full",
    props.class,
  ),
);
</script>

<template>
  <RekaSeparator :orientation="orientation" :decorative="decorative" :class="classes" />
</template>
