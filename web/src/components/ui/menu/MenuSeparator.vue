<script setup lang="ts">
import { inject } from "vue";
import { DropdownMenuSeparator } from "reka-ui";
import { cn } from "@/lib/utils";
import { menuContextKey } from "./menu-context";
import { menuSeparatorClass } from "./menu";

const props = defineProps<{ class?: string }>();
const menu = inject(menuContextKey, null);
</script>

<template>
  <div v-if="menu?.sheet.value" role="separator" :class="cn(menuSeparatorClass, 'mx-0', props.class)" />
  <DropdownMenuSeparator v-else :class="cn(menuSeparatorClass, props.class)" />
</template>
