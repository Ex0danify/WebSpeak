<template>
  <Checkbox v-if="lead" v-model="model" :class="`${choiceClass} relative`">
    <FieldSaved :status="fieldStatus(field)" class="absolute top-2.5 right-2.5" />
    <span class="block text-xs font-bold">{{ title }}</span>
    <span class="mt-1 block text-2xs leading-[1.45] text-fg-muted">{{ lead }}</span>
  </Checkbox>
  <div v-else class="flex min-w-0 items-center gap-2.5">
    <Checkbox v-model="model" class="min-w-0"
      ><strong class="block truncate text-xs">{{ title }}</strong></Checkbox
    >
    <FieldSaved :status="fieldStatus(field)" />
  </div>
</template>

<script setup lang="ts">
import { Checkbox } from "@/shared/ui/checkbox";
import FieldSaved from "@/features/admin/ui/FieldSaved.vue";
import { choiceClass } from "@/features/admin/ui/adminClasses";
import { useAdminServerSettingsStore } from "@/features/admin/server/adminServerSettings";

// A checkbox that is saved as one setting. With a `lead` it is a choice box (title, explanation, the mark in its corner), without
// one a plain row (title, the mark beside it). Listen to `update:model-value` to ask for the save.
defineProps<{ title: string; lead?: string; field: string }>();
const model = defineModel<boolean>({ required: true });
const { fieldStatus } = useAdminServerSettingsStore();
</script>
