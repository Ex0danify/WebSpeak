<template>
  <AdminSection :title="t('audit')" :lead="t('auditLead')" padding="lg" leading="tight" :body-class="bodyClass">
    <ul :class="['mt-4.5 grid gap-2.5', listClass]">
      <AdminEventRow v-for="event in operations.audit" :key="`${event.event}-${event.createdAt}`" :event="event" />
      <AdminListRow v-if="!operations.audit.length" as="li" class="text-center text-fg-muted">{{ t("auditEmpty") }}</AdminListRow>
    </ul>
  </AdminSection>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminEventRow from "@/features/admin/ui/AdminEventRow.vue";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminOperationsStore } from "@/features/admin/operations/adminOperations";

/** `bodyClass` and `listClass` are how the page lets the event list scroll. */
defineProps<{ bodyClass?: string; listClass?: string }>();

const { operations } = storeToRefs(useAdminOperationsStore());
const { t } = useI18n();
</script>
