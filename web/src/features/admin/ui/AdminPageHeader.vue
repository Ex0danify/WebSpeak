<template>
  <div class="flex items-start justify-between gap-3 max-desktop:flex-wrap">
    <div>
      <h1 class="text-2xl font-bold">{{ title }}</h1>
      <p v-if="lead" class="mt-1.75 text-xs text-fg-muted">{{ lead }}</p>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; lead?: string }>();
</script>
