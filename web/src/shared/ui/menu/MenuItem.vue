<script setup lang="ts">
import { inject } from "vue";
import { DropdownMenuItem } from "reka-ui";
import { cn } from "../../lib/cn";
import { menuContextKey } from "./menuContext";
import { menuItemVariants, menuSheetItemClass, type MenuItemVariants } from "./menu";

// One action in a Menu. Put an <Icon> first in the default slot, then the
// label; `shortcut` is right-aligned text (the key, for example "M"), shown
// on desktop only.
// `select` fires on click, Enter and Space, and the menu closes afterwards
// (call event.preventDefault() in the handler to keep it open).
// `tone="danger"` is for destructive actions and colors the icon as well, so
// give those a label that says what happens: the color is not the only cue.
const props = withDefaults(
  defineProps<{
    tone?: MenuItemVariants["tone"];
    disabled?: boolean;
    class?: string;
  }>(),
  { tone: "default", disabled: false },
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
  <button v-if="menu?.sheet.value" type="button" :disabled="disabled" :class="cn(menuItemVariants({ tone }), menuSheetItemClass, props.class)" @click="onSheetClick">
    <slot />
  </button>
  <DropdownMenuItem v-else :disabled="disabled" :class="cn(menuItemVariants({ tone }), props.class)" @select="emit('select', $event)">
    <slot />
    <span v-if="$slots.shortcut" class="ml-auto pl-3 font-mono text-[11px] text-fg-muted"><slot name="shortcut" /></span>
  </DropdownMenuItem>
</template>
