<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonVariants } from "./button";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants["variant"];
    size?: ButtonVariants["size"];
    type?: "button" | "submit" | "reset";
    class?: string;
  }>(),
  { type: "button" },
);

const classes = computed(() => cn(buttonVariants({ variant: props.variant, size: props.size }), props.class));
</script>

<template>
  <button :type="type" :class="classes"><slot /></button>
</template>
