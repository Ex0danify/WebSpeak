<script setup lang="ts">
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from "reka-ui";
import { cn } from "../../lib/cn";
import { tooltipContentClass, tooltipKbdClass } from "./tooltip";

// A short text label for a control with no visible name (icon-only buttons) or a shortcut worth showing. Opens on hover and
// keyboard focus, closes on Esc, blur and pointer leave, and never takes focus. The default slot takes exactly one element.

// A tooltip is supplementary and exposed via aria-describedby, so the trigger needs its own accessible name and nothing
// essential may live only here (touch screens never show one). Each Tooltip has its own provider, so pass `delay` if a toolbar
// needs it faster.
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
