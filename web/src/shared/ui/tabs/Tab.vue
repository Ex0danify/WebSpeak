<script setup lang="ts">
import { TabsTrigger } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { useTabs, type TabValue } from "@/shared/ui/tabs/tabsContext";
import { tabItemVariants } from "@/shared/ui/tabs/tabs";

// One tab inside TabList. Put a <Count> or an icon in the slot next to the
// label as needed.
const props = defineProps<{ value: TabValue; disabled?: boolean; class?: string }>();

const context = useTabs();
</script>

<template>
  <TabsTrigger :value="value" :disabled="disabled" data-tab-item :class="cn(tabItemVariants({ variant: context.variant }), props.class)">
    <slot />
  </TabsTrigger>
</template>
