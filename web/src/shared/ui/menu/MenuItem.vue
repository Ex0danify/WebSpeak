<script setup lang="ts">
import { inject } from "vue";
import { DropdownMenuItem } from "reka-ui";
import { cn } from "../../lib/cn";
import { menuContextKey } from "./menuContext";
import { menuItemVariants, menuSheetItemClass, type MenuItemVariants } from "./menu";

// One action in a Menu, with an <Icon> first in the default slot. `shortcut` is right-aligned text on desktop only. `select`
// fires on click, Enter and Space and the menu closes after, unless the handler calls event.preventDefault(). `tone="danger"`
// needs a label that says what happens, color is no cue.
const props = withDefaults(
  defineProps<{
    tone?: MenuItemVariants["tone"];
    /** The option that is in effect: tinted and marked with aria-current. */
    current?: boolean;
    disabled?: boolean;
    class?: string;
  }>(),
  { tone: "default", current: false, disabled: false },
);

const emit = defineEmits<{ select: [event: Event] }>();
const menu = inject(menuContextKey, null);

// The sheet has no reka item to raise `select`, so it raises its own, with the
// same rule: closing is the default and preventDefault() opts out.
function onSheetClick() {
  const event = new Event("select", { cancelable: true });
  emit("select", event);
  if (!event.defaultPrevented) menu?.close();
}
</script>

<template>
  <button
    v-if="menu?.sheet.value"
    type="button"
    :aria-current="current ? 'true' : undefined"
    :disabled="disabled"
    :class="cn(menuItemVariants({ tone, current }), menuSheetItemClass, props.class)"
    @click="onSheetClick"
  >
    <slot />
  </button>
  <DropdownMenuItem
    v-else
    :aria-current="current ? 'true' : undefined"
    :disabled="disabled"
    :class="cn(menuItemVariants({ tone, current }), props.class)"
    @select="emit('select', $event)"
  >
    <slot />
    <span v-if="$slots.shortcut" class="ml-auto pl-3 font-mono text-caption text-fg-muted"><slot name="shortcut" /></span>
  </DropdownMenuItem>
</template>
