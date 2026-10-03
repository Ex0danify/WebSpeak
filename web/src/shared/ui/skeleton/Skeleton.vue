<script setup lang="ts">
import { cn } from "../../lib/cn";
import { skeletonVariants, type SkeletonVariants } from "./skeleton";

// Placeholder for content that is loading. Hidden from assistive tech: mark
// the loading container `aria-busy="true"` or render a Spinner with a label
// so the state is announced once, not once per placeholder. Size it with
// utility classes (`h-4 w-32`, `size-8`).
const props = defineProps<{
  shape?: SkeletonVariants["shape"];
  class?: string;
}>();
</script>

<template>
  <span :class="cn(skeletonVariants({ shape }), props.class)" aria-hidden="true" />
</template>
