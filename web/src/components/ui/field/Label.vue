<script setup lang="ts">
import { Label as RekaLabel } from "reka-ui";
import { cn } from "@/lib/utils";

defineProps<{ for?: string; class?: string }>();
</script>

<template>
  <RekaLabel :for="$props.for" :class="cn('text-[13px] font-medium leading-5 text-fg', $props.class)"><slot /></RekaLabel>
</template>
