<script setup lang="ts">
import { cn } from "../../lib/cn";
import { spinnerVariants, type SpinnerVariants } from "./spinner";

// Indeterminate progress arc in `currentColor`. Decorative unless `label` is given, which makes it a polite live region with
// that text. Under reduced motion it stops rotating and stays visible as a static arc.
const props = defineProps<{
  size?: SpinnerVariants["size"];
  /** Accessible name, for example "Loading members". Omit next to visible text. */
  label?: string;
  class?: string;
}>();
</script>

<template>
  <span :role="label ? 'status' : undefined" class="inline-flex shrink-0 items-center justify-center">
    <svg
      :class="cn(spinnerVariants({ size }), props.class)"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
    <span v-if="label" class="sr-only">{{ label }}</span>
  </span>
</template>
