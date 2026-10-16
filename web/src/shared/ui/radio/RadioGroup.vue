<script setup lang="ts">
import { RadioGroupRoot } from "reka-ui";
import { cn } from "@/shared/lib/cn";

// Groups Radio buttons under one v-model, on reka-ui RadioGroup, so arrow keys
// move between them. Label it with aria-label or aria-labelledby.
const props = defineProps<{ name?: string; class?: string }>();

const model = defineModel<string | number>();
</script>

<template>
  <RadioGroupRoot v-model="model" :name="name" :class="cn('flex flex-col gap-1', props.class)"><slot /></RadioGroupRoot>
</template>
