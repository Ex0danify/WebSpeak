<script setup lang="ts">
import { RadioGroupRoot } from "reka-ui";
import { cn } from "../../lib/cn";
import type { TabValue } from "./tabsContext";
import { tabListVariants } from "./tabs";

// Pill-shaped single choice, on reka-ui RadioGroup. Children: <Segment value>.
// Label it with aria-label or aria-labelledby. To switch between views with
// panels use <Tabs variant="segmented"> instead.
const props = withDefaults(defineProps<{ fill?: boolean; class?: string }>(), { fill: false });

const model = defineModel<TabValue>();
</script>

<template>
  <RadioGroupRoot v-model="model" orientation="horizontal" :class="cn(tabListVariants({ variant: 'segmented', fill }), props.class)">
    <slot />
  </RadioGroupRoot>
</template>
