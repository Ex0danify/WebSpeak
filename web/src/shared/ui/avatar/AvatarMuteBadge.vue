<template>
  <span
    role="img"
    :title="label"
    :aria-label="label"
    :class="
      cn(
        'absolute grid place-items-center rounded-full border-2 border-surface-1 bg-danger text-surface-1',
        size === 'tile' ? '-right-0.5 -bottom-0.5 size-6' : '-right-1 -bottom-1 size-4 max-compact:size-5',
      )
    "
    ><Icon name="volume-off" :size="size === 'tile' ? 13 : 9"
  /></span>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";

// A red speaker mark on the bottom-right corner of an avatar, for "muted on this side". Place it inside the avatar's `relative`
// wrapper; `label` is the accessible name, for example "Muted by you".
withDefaults(defineProps<{ label: string; size?: "row" | "tile" }>(), { size: "row" });
</script>
