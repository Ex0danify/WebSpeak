<template>
  <nav :aria-label="label" class="flex items-center justify-between gap-2">
    <Button variant="outline" size="sm" :disabled="page <= 1" @click="page -= 1"
      ><Icon name="chevron-right" :size="16" class="rotate-180" />{{ previousLabel }}</Button
    >
    <span aria-live="polite" class="text-2xs text-fg-muted">{{ summary }}</span>
    <Button variant="outline" size="sm" :disabled="page >= pageCount" @click="page += 1"
      >{{ nextLabel }}<Icon name="chevron-right" :size="16"
    /></Button>
  </nav>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

// Previous and next with the position between them. The caller passes every text translated, the page is 1-based.
defineProps<{ pageCount: number; label: string; previousLabel: string; nextLabel: string; summary: string }>();

const page = defineModel<number>({ required: true });
</script>
