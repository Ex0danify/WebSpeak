<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui";
import { cn } from "@/lib/utils";
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
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent :side="side" :align="align" :side-offset="8" :collision-padding="8" :aria-label="label" :class="cn(popoverContentClass, props.class)">
        <slot :close="() => (open = false)" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
