<template>
  <div
    v-if="spacer.align === 'repeat'"
    aria-hidden="true"
    class="overflow-hidden text-caption whitespace-nowrap text-fg-muted select-none not-first:mt-2"
    :style="{ marginLeft: `${depth * 10}px` }"
    data-spacer
    data-spacer-fill
  >
    {{ spacer.text.repeat(REPEAT_COUNT) }}
  </div>
  <div
    v-else
    role="separator"
    :aria-label="spacer.text || undefined"
    :class="['truncate text-caption font-bold tracking-wide text-fg-muted uppercase select-none not-first:mt-2', ALIGN_CLASS[spacer.align]]"
    :style="{ marginLeft: `${depth * 10}px` }"
    data-spacer
  >
    {{ spacer.text }}
  </div>
</template>

<script setup lang="ts">
import type { Spacer } from "@/shared/lib/parseSpacer";

defineProps<{ spacer: Spacer; depth: number }>();

// Clipped by the row's overflow, so a long enough tile run fills any panel width without measuring it.
const REPEAT_COUNT = 200;
const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const;
</script>
