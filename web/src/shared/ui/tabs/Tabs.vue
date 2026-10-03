<script setup lang="ts">
import { TabsRoot } from "reka-ui";
import { cn } from "../../lib/cn";
import { provideTabs, type TabValue } from "./tabsContext";

// Root of a tabbed area, on reka-ui Tabs. Children: <TabList> holding
// <Tab value>, then <TabPanel value> for each tab. `variant` picks underline
// tabs or a segmented pill list. The model must match a Tab value, otherwise
// no tab is reachable with the keyboard. `variant` is read once. For a plain
// single choice use Segmented.
const props = withDefaults(defineProps<{ variant?: "underline" | "segmented"; class?: string }>(), { variant: "underline" });

const model = defineModel<TabValue>();
provideTabs({ variant: props.variant });
</script>

<template>
  <!-- Panels stay mounted while hidden, so form state inside them survives switching. -->
  <TabsRoot v-model="model" :unmount-on-hide="false" :class="cn('min-w-0', props.class)"><slot /></TabsRoot>
</template>
