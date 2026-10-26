<template>
  <AdminSection :title="t('audit')" :lead="t('auditLead')">
    <ScrollRegion :label="t('audit')">
      <ul class="m-0 grid list-none gap-2.5 p-0">
        <AdminEventRow v-for="event in diagnostics.audit" :key="`${event.event}-${event.createdAt}`" :event="event" />
        <AdminListRow v-if="!diagnostics.audit.length" as="li" class="text-center text-fg-muted">{{ t("auditEmpty") }}</AdminListRow>
      </ul>
    </ScrollRegion>
  </AdminSection>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminEventRow from "@/features/admin/ui/AdminEventRow.vue";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import ScrollRegion from "@/features/admin/ui/ScrollRegion.vue";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";

const { diagnostics } = storeToRefs(useAdminDiagnosticsStore());
const { t } = useI18n();
</script>
