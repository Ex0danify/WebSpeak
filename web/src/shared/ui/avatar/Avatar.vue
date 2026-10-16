<script setup lang="ts">
import { computed } from "vue";
import { AvatarFallback, AvatarImage, AvatarRoot } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { avatarStyle } from "@/shared/lib/format";
import { avatarVariants, type AvatarVariants } from "@/shared/ui/avatar/avatar";

// A member picture, or the first letter of their name when there is none. `tint` paints the fallback with a name-derived color
// (`self` gives your own the accent gradient), `stack` overlaps on media. `speaking` draws a ring, set `surface` to what the
// avatar sits on and pass `speakingLabel`.

// Without `label` the avatar is decorative and hidden from assistive tech, for rows where the name is printed next to it.
const props = withDefaults(
  defineProps<{
    name: string;
    src?: string;
    size?: AvatarVariants["size"];
    surface?: AvatarVariants["surface"];
    speaking?: boolean;
    tint?: boolean;
    /** With `tint`: the member is the local user. */
    self?: boolean;
    stack?: boolean;
    /** Accessible name. Leave out when the name is visible beside the avatar. */
    label?: string;
    /** Text read out while `speaking`, for example "speaking". */
    speakingLabel?: string;
    class?: string;
  }>(),
  { speaking: false, tint: false, self: false, stack: false },
);

// Array.from keeps a surrogate pair (emoji, rare CJK) in one piece.
const initial = computed(() => (Array.from(props.name.trim())[0] ?? "?").toUpperCase());
const tintStyle = computed(() => (props.tint ? avatarStyle(props.name, props.self) : undefined));
const decorative = computed(() => !props.label && !(props.speaking && props.speakingLabel));
</script>

<template>
  <AvatarRoot
    :class="cn(avatarVariants({ size, surface, speaking, tint, stack }), props.class)"
    :style="tintStyle"
    :role="decorative ? undefined : 'img'"
    :aria-hidden="decorative ? true : undefined"
    :aria-label="decorative ? undefined : [label, speaking ? speakingLabel : undefined].filter(Boolean).join(', ')"
  >
    <AvatarImage v-if="src" :src="src" alt="" class="size-full object-cover" draggable="false" />
    <AvatarFallback aria-hidden="true">{{ initial }}</AvatarFallback>
  </AvatarRoot>
</template>
