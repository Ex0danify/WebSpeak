<script setup lang="ts">
import { TabsList } from "reka-ui";
import { cn } from "@/lib/utils";
import { useTabs } from "./tabs-context";
import { tabListVariants } from "./tabs";

// The tablist. Label it with aria-label or aria-labelledby.
// `fill` stretches segmented tabs across the container.
const props = withDefaults(defineProps<{ fill?: boolean; class?: string }>(), { fill: false });

const context = useTabs();
</script>

<template>
  <TabsList :class="cn(tabListVariants({ variant: context.variant, fill }), props.class)">
    <slot />
  </TabsList>
</template>
