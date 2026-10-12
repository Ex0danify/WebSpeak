<template>
  <section :aria-labelledby="id" class="rounded-lg border border-line bg-surface-1 p-6">
    <div class="mb-4 flex items-baseline justify-between gap-3">
      <h2 :id="id" class="text-base font-semibold">{{ title }}</h2>
      <span class="font-mono text-caption tracking-widest text-fg-muted uppercase">{{ note }}</span>
    </div>
    <slot />
  </section>
</template>

<script setup lang="ts">
defineProps<{ id: string; title: string; note: string }>();
</script>
