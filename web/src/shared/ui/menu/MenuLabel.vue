<script setup lang="ts">
import { inject } from "vue";
import { DropdownMenuLabel } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { menuContextKey } from "@/shared/ui/menu/menuContext";
import { menuLabelClass, menuLabelPlainClass } from "@/shared/ui/menu/menu";

// A non-interactive heading for a group of items; `plain` shows it as a title in the text color.
const props = defineProps<{ plain?: boolean; class?: string }>();
const menu = inject(menuContextKey, null);
</script>

<template>
  <div v-if="menu?.sheet.value" :class="cn(menuLabelClass, plain && menuLabelPlainClass, props.class)"><slot /></div>
  <DropdownMenuLabel v-else :class="cn(menuLabelClass, plain && menuLabelPlainClass, props.class)"><slot /></DropdownMenuLabel>
</template>
