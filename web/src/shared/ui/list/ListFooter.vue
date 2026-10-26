<template>
  <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-2xs text-fg-muted">
    <span aria-live="polite">{{ summary }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
// The line under a list that shows only part of its rows: how many of how many, and the way to the rest in the slot.
defineProps<{ summary: string }>();
</script>
