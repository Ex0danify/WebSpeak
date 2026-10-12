<script setup lang="ts">
import { Label as RekaLabel } from "reka-ui";
import { cn } from "../../lib/cn";

defineProps<{ for?: string; class?: string }>();
</script>

<template>
  <RekaLabel :for="$props.for" :class="cn('text-ui leading-5 font-medium text-fg', $props.class)"><slot /></RekaLabel>
</template>
