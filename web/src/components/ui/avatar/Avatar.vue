<script setup lang="ts">
import { computed } from "vue";
import { AvatarFallback, AvatarImage, AvatarRoot } from "reka-ui";
import { cn } from "@/lib/utils";
import { avatarVariants, type AvatarVariants } from "./avatar";

// A member picture, or the first letter of their name when there is none, it
// is still loading or it fails to load. Built on reka-ui Avatar. `speaking` draws a 2 px success ring offset by a 2 px gap in
// the surface color (set `surface` to what the avatar sits on). The ring is
// not the only cue: pass `speakingLabel` and it is read out as text.
// Without `label` the avatar is decorative and hidden from assistive tech, for
// rows where the name is printed next to it.
const props = withDefaults(
  defineProps<{
    name: string;
    src?: string;
    size?: AvatarVariants["size"];
    surface?: AvatarVariants["surface"];
    speaking?: boolean;
    /** Accessible name. Leave out when the name is visible beside the avatar. */
    label?: string;
    /** Text read out while `speaking`, for example "speaking". */
    speakingLabel?: string;
    class?: string;
  }>(),
  { speaking: false },
);

// Array.from keeps a surrogate pair (emoji, rare CJK) in one piece.
const initial = computed(() => (Array.from(props.name.trim())[0] ?? "?").toUpperCase());
const decorative = computed(() => !props.label && !(props.speaking && props.speakingLabel));
</script>

<template>
  <AvatarRoot
    :class="cn(avatarVariants({ size, surface, speaking }), props.class)"
    :role="decorative ? undefined : 'img'"
    :aria-hidden="decorative ? true : undefined"
    :aria-label="decorative ? undefined : [label, speaking ? speakingLabel : undefined].filter(Boolean).join(', ')"
  >
    <AvatarImage v-if="src" :src="src" alt="" class="size-full object-cover" draggable="false" />
    <AvatarFallback aria-hidden="true">{{ initial }}</AvatarFallback>
  </AvatarRoot>
</template>
