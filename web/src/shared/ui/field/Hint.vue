<script setup lang="ts">
import { cn } from "../../lib/cn";
import { Icon } from "../icon";

// `invalid` is an error message: danger color plus an icon, never color alone.
defineProps<{ id?: string; invalid?: boolean; class?: string }>();
</script>

<template>
  <p :id="id" :class="cn('m-0 text-xs leading-4', invalid ? 'flex items-center gap-1.5 text-danger' : 'text-fg-muted', $props.class)">
    <Icon v-if="invalid" name="alert" :size="14" />
    <span><slot /></span>
  </p>
</template>
