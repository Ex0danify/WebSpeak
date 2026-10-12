<script setup lang="ts">
import { cn } from "../../lib/cn";
import { voiceTileVariants } from "./voiceTile";

// The tile of one member (or of the "+N more" overflow) in the voice grid. `speaking` adds the
// success border and ring. Put an Avatar, then a name with `voiceTileNameClass` and a status line
// with `voiceTileStatusVariants`, inside it.
const props = withDefaults(defineProps<{ speaking?: boolean; as?: "article" | "div" | "li"; class?: string }>(), {
  speaking: false,
  as: "article",
});
</script>

<template>
  <component :is="as" :class="cn(voiceTileVariants({ speaking }), props.class)"><slot /></component>
</template>
