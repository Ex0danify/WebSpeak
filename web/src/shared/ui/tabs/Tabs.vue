<script setup lang="ts">
import { TabsRoot } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { provideTabs, type TabValue } from "@/shared/ui/tabs/tabsContext";

// Root of a tabbed area, on reka-ui Tabs, with <TabList> holding <Tab value> and then a <TabPanel value> per tab. `variant`
// picks underline tabs, a segmented pill list or separate `pills`, and is read once. The model must match a Tab value or no tab
// is reachable by keyboard. For a plain single choice use Segmented.
const props = withDefaults(defineProps<{ variant?: "underline" | "segmented" | "pills" | "bar"; class?: string }>(), {
  variant: "underline",
});

const model = defineModel<TabValue>();
provideTabs({ variant: props.variant });
</script>

<template>
  <!-- Panels stay mounted while hidden, so form state inside them survives switching. -->
  <TabsRoot v-model="model" :unmount-on-hide="false" :class="cn('min-w-0', props.class)"><slot /></TabsRoot>
</template>
