<template>
  <Field :id="id" :label="label" :hint="hint" :error="issueText(field)">
    <template #label>
      <span class="flex items-baseline justify-between gap-2"
        ><span>{{ label }}</span
        ><FieldSaved :status="fieldStatus(field)"
      /></span>
    </template>
    <slot />
  </Field>
</template>

<script setup lang="ts">
import { Field } from "@/shared/ui/field";
import FieldSaved from "@/features/admin/ui/FieldSaved.vue";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";

// A settings field: the label, the hint for a value that was not saved, and a mark next to the label when this field was saved.
// `field` is the key the store knows it by (a form field name, or `relay:<node id>:<field>`).
defineProps<{ label: string; field: string; hint?: string; id?: string }>();
const { issueText, fieldStatus } = useAdminServerSettingsStore();
</script>
