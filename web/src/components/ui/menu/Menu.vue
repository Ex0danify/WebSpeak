<script setup lang="ts">
import { Comment, Fragment, cloneVNode, defineComponent, provide, type VNode } from "vue";
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from "reka-ui";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { Button } from "../button";
import { Dialog } from "../dialog";
import { menuContextKey } from "./menu-context";
import { menuContentClass } from "./menu";

// Dropdown menu on reka-ui: anchoring, collision handling, arrow keys,
// typeahead, Esc, and focus back on the trigger all come from it.
//
//   <Menu label="Member actions" close-label="Close">
//     <template #trigger><Button variant="outline">Actions</Button></template>
//     <MenuItem @select="move">Move to my channel</MenuItem>
//     <MenuSeparator />
//     <MenuItem tone="danger">Kick</MenuItem>
//   </Menu>
//
// The trigger slot takes exactly one element (a Button, usually); it gets the
// menu's aria attributes and click handling. Bind `v-model:open` to open the
// menu from code. It is not modal: the page stays scrollable and a click
// outside closes it.
//
// At 740 px and below it is a bottom sheet instead: the same items as large
// buttons in a Dialog pinned to the bottom edge, with a Close button under
// them, submenus expanding in place. Tapping the backdrop or pressing Esc
// closes it too. Pass `closeLabel` translated; the default is English.
const props = withDefaults(
  defineProps<{
    /** Accessible name of the menu. */
    label?: string;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    /** Text of the sheet's Close button (mobile only). */
    closeLabel?: string;
    class?: string;
  }>(),
  { side: "bottom", align: "start", closeLabel: "Close" },
);

const open = defineModel<boolean>("open", { default: false });

// Reka focuses the trigger when the desktop popup closes. That is right for a real button, but a
// caller whose trigger cannot take focus (a hidden span placed at a click point) needs to manage
// it itself: call `event.preventDefault()` in the handler and focus whatever should get it.
const emit = defineEmits<{ closeAutoFocus: [event: Event] }>();


const sheet = useMediaQuery("(max-width: 740px)");
provide(menuContextKey, { sheet, close: () => (open.value = false) });

// A slot renders as a Fragment; the element that needs the props is inside it.
function firstElement(nodes: VNode[]): VNode | undefined {
  for (const node of nodes) {
    if (node.type === Comment) continue;
    if (node.type === Fragment) {
      const inner = firstElement((node.children ?? []) as VNode[]);
      if (inner) return inner;
      continue;
    }
    return node;
  }
}

// Reka's trigger belongs to the popup. The sheet has its own: it puts the same
// aria state and a toggle click on whatever single element the slot renders.
const SheetTrigger = defineComponent({
  setup(_, { slots }) {
    return () => {
      const node = firstElement(slots.default?.() ?? []);
      if (!node) return null;
      return cloneVNode(node, {
        "aria-haspopup": "menu",
        "aria-expanded": open.value ? "true" : "false",
        onClick: () => (open.value = !open.value),
      });
    };
  },
});
</script>

<template>
  <template v-if="sheet">
    <SheetTrigger><slot name="trigger" /></SheetTrigger>
    <Dialog v-model="open" placement="bottom" :label="label">
      <div class="flex flex-col gap-0.5 py-1" :aria-label="label" role="group">
        <slot />
      </div>
      <template #footer>
        <Button variant="secondary" class="w-full max-[740px]:h-11" @click="open = false">{{ closeLabel }}</Button>
      </template>
    </Dialog>
  </template>
  <DropdownMenuRoot v-else v-model:open="open" :modal="false">
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent :side="side" :align="align" :side-offset="6" :collision-padding="8" :aria-label="label" :aria-labelledby="undefined" :class="cn(menuContentClass, props.class)" @close-auto-focus="emit('closeAutoFocus', $event)">
        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
