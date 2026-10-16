<script setup lang="ts">
import { RadioGroupItem } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import type { TabValue } from "@/shared/ui/tabs/tabsContext";
import { tabItemVariants } from "@/shared/ui/tabs/tabs";

// One option of a Segmented control.
const props = defineProps<{ value: TabValue; disabled?: boolean; class?: string }>();
</script>

<template>
  <RadioGroupItem :value="value" :disabled="disabled" data-tab-item :class="cn(tabItemVariants({ variant: 'segmented' }), props.class)">
    <slot />
  </RadioGroupItem>
</template>
