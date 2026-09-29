<template>
  <div class="screen-share-inline-error" role="status"><Icon name="info" :size="15" /> <span>{{ text }}</span></div>
</template>

<script setup lang="ts">
import { Icon } from "@/components/ui/icon";

defineProps<{
  text: string;
}>();
</script>

<style scoped>
.screen-share-inline-error { display: flex; align-items: center; gap: 7px; margin: 10px 0 0; padding: 8px 10px; color: var(--ws-danger); border: 1px solid color-mix(in srgb, var(--ws-danger) 28%, var(--ws-line)); border-radius: 9px; background: color-mix(in srgb, var(--ws-danger-soft) 45%, var(--ws-surface-1)); font-size: 10px; line-height: 1.4; }
</style>
