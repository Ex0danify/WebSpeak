<script setup lang="ts">
import { TabsContent } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import type { TabValue } from "@/shared/ui/tabs/tabsContext";

// Content for one tab. Stays mounted and is hidden while inactive (see Tabs).
// Use inside Tabs.
const props = defineProps<{ value: TabValue; class?: string }>();
</script>

<template>
  <TabsContent
    :value="value"
    :class="cn('focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent', props.class)"
  >
    <slot />
  </TabsContent>
</template>
