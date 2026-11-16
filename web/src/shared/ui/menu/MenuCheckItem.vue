<script setup lang="ts">
import { inject } from "vue";
import { DropdownMenuCheckboxItem, DropdownMenuItemIndicator } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/icon";
import { menuContextKey } from "@/shared/ui/menu/menuContext";
import { menuItemVariants, menuSheetItemClass } from "@/shared/ui/menu/menu";

// An option in a Menu that is on or off and can be on together with its siblings (the groups a member is in). `checked` is
// the state and the caller changes it on `select`, the menu closes after unless the handler calls event.preventDefault().
// A choice among exclusive options is a MenuItem with `current`.
const props = withDefaults(defineProps<{ checked?: boolean; disabled?: boolean; class?: string }>(), { checked: false, disabled: false });

const emit = defineEmits<{ select: [event: Event] }>();
const menu = inject(menuContextKey, null);

// The sheet has no reka item to raise `select`, so it raises its own, with the same rule as MenuItem.
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
    :aria-pressed="checked ? 'true' : 'false'"
    :disabled="disabled"
    :class="cn(menuItemVariants({ tone: 'default' }), menuSheetItemClass, props.class)"
    @click="onSheetClick"
  >
    <slot />
    <span class="ml-auto size-4 shrink-0 text-accent"><Icon v-if="checked" name="check" :size="15" /></span>
  </button>
  <DropdownMenuCheckboxItem
    v-else
    :model-value="checked"
    :disabled="disabled"
    :class="cn(menuItemVariants({ tone: 'default' }), props.class)"
    @select="emit('select', $event)"
  >
    <slot />
    <span class="ml-auto size-4 shrink-0 text-accent">
      <DropdownMenuItemIndicator><Icon name="check" :size="15" /></DropdownMenuItemIndicator>
    </span>
  </DropdownMenuCheckboxItem>
</template>
