<script setup lang="ts">
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from "reka-ui";
import { cn } from "../../lib/cn";
import { tooltipContentClass, tooltipKbdClass } from "./tooltip";

// A short text label for a control that has no visible name (icon-only
// buttons) or a shortcut worth showing. It opens on hover and on keyboard
// focus, closes on Esc, blur and pointer leave, and never takes focus.
//
//   <Tooltip text="Mute microphone" shortcut="M">
//     <Button icon-only aria-label="Mute microphone"><Icon name="mic" /></Button>
//   </Tooltip>
//
// The default slot takes exactly one element (the trigger). A tooltip is
// supplementary: it is exposed via aria-describedby, so the trigger must
// still have its own accessible name, and nothing essential may live only in
// a tooltip (touch screens never show one). Use Popover for interactive
// content. Each Tooltip carries its own provider, so there is no shared
// "skip the delay when moving between tooltips" behavior; pass `delay` if a
// toolbar needs it faster.
const props = withDefaults(
  defineProps<{
    text: string;
    shortcut?: string;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    delay?: number;
    class?: string;
  }>(),
  { side: "top", align: "center", delay: 400 },
);
</script>

<template>
  <TooltipProvider :delay-duration="delay" :disable-hoverable-content="true">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent :side="side" :align="align" :side-offset="8" :collision-padding="8" :class="cn(tooltipContentClass, props.class)">
          {{ text }}<kbd v-if="shortcut" :class="tooltipKbdClass">{{ shortcut }}</kbd>
          <TooltipArrow :width="10" :height="5" class="fill-fg" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
