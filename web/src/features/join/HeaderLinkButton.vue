<template>
  <Button
    :as="href ? 'a' : 'button'"
    :variant="variant"
    size="sm"
    :class="actionClass"
    :href="href"
    :target="href && isExternal ? '_blank' : undefined"
    :rel="href && isExternal ? 'noreferrer' : undefined"
    :title="label"
    :aria-label="label"
    :aria-haspopup="popup ? 'dialog' : undefined"
  >
    <span v-if="glyph" class="grid size-[18px] place-items-center rounded-sm bg-danger text-caption leading-none text-accent-fg">{{
      glyph
    }}</span>
    <Icon v-else-if="icon" :name="icon" :size="iconSize" />
    <span class="max-compact:hidden">{{ label }}</span>
  </Button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button, type ButtonVariants } from "@/shared/ui/button";
import { Icon, type IconName, type IconSize } from "@/shared/ui/icon";

const props = defineProps<{
  label: string;
  variant: NonNullable<ButtonVariants["variant"]>;
  /** A link when set, a plain button otherwise. */
  href?: string;
  icon?: IconName;
  iconSize?: IconSize;
  /** Text mark shown instead of an icon. */
  glyph?: string;
  /** Opens a dialog. */
  popup?: boolean;
  /** Secondary links hide on a phone; they sit in the footer there. */
  secondary?: boolean;
}>();

// Labels wrap (de and ru are long) and hide on narrow screens, where the buttons shrink to squares.
const baseClass =
  "h-auto min-h-8 whitespace-normal py-1 text-left text-caption leading-[1.15] max-compact:min-h-11 max-compact:w-11 max-compact:px-0 max-compact:py-0";

const actionClass = computed(() => (props.secondary ? `${baseClass} max-compact:hidden` : baseClass));
const isExternal = computed(() => props.href?.startsWith("http") ?? false);
</script>
