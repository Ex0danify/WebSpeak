<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui";
import { cn } from "../../lib/cn";
import { popoverContentClass } from "./popover";

// A floating panel anchored to its trigger, for content rather than actions
// (for actions use Menu). Not modal: focus moves into the panel when it
// opens, Tab can leave it, Esc or a click outside closes it, and focus goes
// back to the trigger.
//
//   <Popover label="Output volume">
//     <template #trigger><Button icon-only aria-label="Volume"><Icon name="volume" /></Button></template>
//     <template #default="{ close }">
//       <Slider v-model="volume" aria-label="Output volume" />
//       <Button @click="close">Done</Button>
//     </template>
//   </Popover>
//
// The trigger slot takes exactly one element. `label` names the panel for
// assistive tech. `v-model:open` opens it from code. Width is `w-72`; pass a
// `class` to change it.
const props = withDefaults(
  defineProps<{
    label?: string;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    class?: string;
  }>(),
  { side: "bottom", align: "center" },
);

const open = defineModel<boolean>("open", { default: false });

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function tabbableEdges(container: HTMLElement): [HTMLElement, HTMLElement] | [] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
  return candidates.length ? [candidates[0], candidates[candidates.length - 1]] : [];
}

// reka-ui's FocusScope always loops inside a popover (the `loop` prop it passes to FocusScope is
// hardcoded true, with no way to turn it off from here), which contradicts this component's own
// contract ("Tab can leave it", F35). FocusScope listens on the panel itself; a capture listener on
// an ancestor therefore runs first. At the panel's tabbable edges only, stop the key press from
// reaching FocusScope, so the browser's own default action (moving focus) runs unopposed instead of
// being redirected back into the panel.
function releaseTabAtEdges(event: KeyboardEvent): void {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  const [first, last] = tabbableEdges(event.currentTarget as HTMLElement);
  if (!first) return;
  const active = document.activeElement;
  if ((event.shiftKey && active === first) || (!event.shiftKey && active === last)) event.stopPropagation();
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <div @keydown.capture="releaseTabAtEdges">
        <PopoverContent :side="side" :align="align" :side-offset="8" :collision-padding="8" :aria-label="label" :class="cn(popoverContentClass, props.class)">
          <slot :close="() => (open = false)" />
        </PopoverContent>
      </div>
    </PopoverPortal>
  </PopoverRoot>
</template>
