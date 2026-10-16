<script setup lang="ts">
import { inject, ref } from "vue";
import { DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/icon";
import { menuContextKey } from "@/shared/ui/menu/menuContext";
import { menuContentClass, menuItemVariants, menuSheetItemClass } from "@/shared/ui/menu/menu";

// A submenu ("Move to channel"): an item that opens a second menu beside it,
// with Right and Left arrow keys. In the mobile sheet it expands in place
// instead. The label goes in the `label` slot, the items in the default slot.
// Optional leading icon in the `icon` slot.
const props = withDefaults(defineProps<{ disabled?: boolean; class?: string }>(), { disabled: false });

const menu = inject(menuContextKey, null);
const expanded = ref(false);
</script>

<template>
  <template v-if="menu?.sheet.value">
    <button
      type="button"
      :disabled="disabled"
      :aria-expanded="expanded ? 'true' : 'false'"
      :class="cn(menuItemVariants({ tone: 'default' }), menuSheetItemClass, props.class)"
      @click="expanded = !expanded"
    >
      <slot name="icon" />
      <span class="min-w-0 flex-1 truncate"><slot name="label" /></span>
      <Icon :name="expanded ? 'chevron-down' : 'chevron-right'" :size="15" class="shrink-0" />
    </button>
    <div v-if="expanded" class="ml-5 flex flex-col gap-0.5 border-l border-line pl-2"><slot /></div>
  </template>
  <DropdownMenuSub v-else>
    <DropdownMenuSubTrigger
      :disabled="disabled"
      :class="cn(menuItemVariants({ tone: 'default' }), 'data-[state=open]:bg-surface-2', props.class)"
    >
      <slot name="icon" />
      <span class="min-w-0 flex-1 truncate"><slot name="label" /></span>
      <Icon name="chevron-right" :size="15" class="shrink-0" />
    </DropdownMenuSubTrigger>
    <DropdownMenuPortal>
      <DropdownMenuSubContent :side-offset="4" :align-offset="-7" :collision-padding="8" :class="menuContentClass">
        <slot />
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  </DropdownMenuSub>
</template>
