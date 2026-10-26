<template>
  <AdminSection :title="t('systemInfo')" :lead="t('systemInfoLead')">
    <template #action>
      <a class="text-2xs font-bold whitespace-nowrap text-accent no-underline" href="/api/admin/diagnostics/report">{{
        t("downloadReport")
      }}</a>
    </template>
    <dl class="grid grid-cols-2 gap-2.25 max-narrow:grid-cols-1">
      <AdminListRow v-for="fact in diagnosticFacts" :key="fact.label">
        <dt class="text-2xs text-fg-muted">{{ fact.label }}</dt>
        <dd class="mt-1 truncate text-caption font-bold">{{ fact.value }}</dd>
      </AdminListRow>
    </dl>
    <Button variant="secondary" @click="downloadBackup()">{{ t("exportBackup") }}</Button>
  </AdminSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { VERSION_PREFIX } from "@/shared/lib/brand";
import { Button } from "@/shared/ui/button";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";

const diagnosticsStore = useAdminDiagnosticsStore();
const { diagnostics } = storeToRefs(diagnosticsStore);
const { downloadBackup } = diagnosticsStore;
const { t } = useI18n();

const diagnosticFacts = computed(() => {
  const d = diagnostics.value.facts;
  return [
    { label: t("version"), value: d.version || "—" },
    { label: t("runtime"), value: d.node || "—" },
    { label: t("platform"), value: `${d.platform || "—"} / ${d.arch || "—"}` },
    { label: t("databaseSchema"), value: `${VERSION_PREFIX}${d.schemaVersion || "—"}` },
    { label: t("createdSessions"), value: d.createdSessions },
  ];
});
</script>
