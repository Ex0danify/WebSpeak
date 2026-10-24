<template>
  <div :class="cn('flex shrink-0 items-start justify-between max-desktop:flex-wrap max-narrow:gap-3.75', props.class)">
    <div>
      <h2 class="text-2xl font-bold">{{ title }}</h2>
      <p class="mt-1.75 text-xs text-fg-muted">{{ lead }}</p>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { cn } from "@/shared/lib/cn";

const props = defineProps<{ title: string; lead: string; class?: string }>();
</script>
