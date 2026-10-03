<script setup lang="ts">
import { cn } from "../../lib/cn";

// A keyboard key cap for shortcut hints ("M", "Ctrl", "Esc"). One key per
// element; compose several for a chord. Tooltip has its own inline shortcut
// style because it sits on an inverted surface.
const props = defineProps<{ class?: string }>();
</script>

<template>
  <kbd
    :class="
      cn(
        'box-border inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line bg-surface-2 px-1.5 font-mono text-[11px] font-medium leading-none text-fg-muted',
        props.class,
      )
    "
  ><slot /></kbd>
</template>
