<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/icon";

// A titled block that opens and closes. The title is the button, the default slot is the content. `class` styles the wrapper.
const props = defineProps<{ title: string; class?: string }>();
const open = defineModel<boolean>("open", { default: false });
</script>

<template>
  <CollapsibleRoot v-model:open="open" :class="cn('rounded-md border border-line', props.class)">
    <CollapsibleTrigger
      class="group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon
        name="chevron-right"
        :size="14"
        class="shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
      />
      <span class="min-w-0">{{ title }}</span>
    </CollapsibleTrigger>
    <CollapsibleContent class="border-t border-line px-2.5 py-2"><slot /></CollapsibleContent>
  </CollapsibleRoot>
</template>
