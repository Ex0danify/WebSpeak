<script setup lang="ts">
import { cn } from "@/shared/lib/cn";
import { countVariants, type CountVariants } from "@/shared/ui/chip/chip";

// A number in a pill (unread messages, members). Pass the value as the slot
// and add an `aria-label` when the bare number is not enough context.
defineProps<{ variant?: CountVariants["variant"]; class?: string }>();
</script>

<template>
  <span :class="cn(countVariants({ variant }), $props.class)"><slot /></span>
</template>
