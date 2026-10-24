<template>
  <div class="grid gap-2">
    <div class="flex items-baseline justify-between gap-2">
      <Label :id="labelId">{{ label }}</Label>
      <FieldSaved :status="fieldStatus(field)" />
    </div>
    <slot :label-id="labelId" />
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";
import { Label } from "@/shared/ui/field";
import FieldSaved from "@/features/admin/ui/FieldSaved.vue";
import { useAdminServerSettingsStore } from "@/features/admin/server/adminServerSettings";

// A labelled group of choices (radios) that is saved as one setting: the label, and the mark on its row when the setting was saved.
// The group inside names itself with the `label-id` the slot gets (`aria-labelledby`).
defineProps<{ label: string; field: string }>();
const labelId = `setting-group-${useId()}`;
const { fieldStatus } = useAdminServerSettingsStore();
</script>
