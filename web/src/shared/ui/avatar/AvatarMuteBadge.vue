<template>
  <span
    role="img"
    :title="label"
    :aria-label="label"
    :class="
      cn(
        'absolute grid place-items-center rounded-full border-2 border-surface-1 text-surface-1',
        tone === 'warning' ? 'bg-warning' : 'bg-danger',
        size === 'tile' ? '-right-0.5 -bottom-0.5 size-6' : '-right-1 -bottom-1 size-4 max-compact:size-5',
      )
    "
    ><Icon :name="icon" :size="size === 'tile' ? 13 : 9"
  /></span>
</template>

<script setup lang="ts">
import { Icon, type IconName } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";

// A round mark on the bottom-right corner of an avatar. By default a red speaker for "muted on this side", `tone="warning"` with
// another `icon` serves a state that needs attention, such as no talk power. Place it inside the avatar's `relative` wrapper;
// `label` is the accessible name, for example "Muted by you".
withDefaults(defineProps<{ label: string; size?: "row" | "tile"; icon?: IconName; tone?: "danger" | "warning" }>(), {
  size: "row",
  icon: "volume-off",
  tone: "danger",
});
</script>
