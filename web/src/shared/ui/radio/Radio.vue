<script setup lang="ts">
import { RadioGroupIndicator, RadioGroupItem } from "reka-ui";
import { cn } from "../../lib/cn";
import { checkBoxClass, checkRowClass } from "../shared/checkControl";

// One option of a RadioGroup; it does not work outside one.
// Attributes (disabled, ...) go to the control; `class` styles the label.
defineOptions({ inheritAttrs: false });

const props = defineProps<{ value: string | number; class?: string }>();
</script>

<template>
  <label :class="cn(checkRowClass, props.class)">
    <RadioGroupItem v-bind="$attrs" :value="value" :class="cn(checkBoxClass, 'rounded-full data-[state=checked]:shadow-ring-accent')">
      <RadioGroupIndicator class="block size-2.5 rounded-full bg-accent" />
    </RadioGroupItem>
    <span v-if="$slots.default" class="min-w-0"><slot /></span>
  </label>
</template>
