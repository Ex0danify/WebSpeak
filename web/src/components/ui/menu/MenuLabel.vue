<script setup lang="ts">
import { inject } from "vue";
import { DropdownMenuLabel } from "reka-ui";
import { cn } from "@/lib/utils";
import { menuContextKey } from "./menu-context";
import { menuLabelClass } from "./menu";

// A non-interactive heading for a group of items.
const props = defineProps<{ class?: string }>();
const menu = inject(menuContextKey, null);
</script>

<template>
  <div v-if="menu?.sheet.value" :class="cn(menuLabelClass, props.class)"><slot /></div>
  <DropdownMenuLabel v-else :class="cn(menuLabelClass, props.class)"><slot /></DropdownMenuLabel>
</template>
