<template>
  <AdminSection :title="t('systemInfo')" :lead="t('systemInfoLead')">
    <dl class="grid grid-cols-2 gap-2.25 max-narrow:grid-cols-1">
      <AdminListRow v-for="fact in diagnosticFacts" :key="fact.label">
        <dt class="text-2xs text-fg-muted">{{ fact.label }}</dt>
        <dd class="mt-1 truncate text-caption font-bold">{{ fact.value }}</dd>
      </AdminListRow>
    </dl>
    <div class="grid grid-cols-2 items-start gap-2.25 max-narrow:grid-cols-1">
      <div class="flex flex-col items-start gap-1.5">
        <Button variant="secondary" size="sm" as="a" href="/api/admin/diagnostics/bundle" aria-describedby="bundle-hint">{{
          t("downloadBundle")
        }}</Button>
        <p id="bundle-hint" class="m-0 text-2xs text-fg-muted">{{ t("bundleHint") }}</p>
      </div>
      <div class="flex flex-col items-start gap-1.5">
        <Button variant="secondary" size="sm" aria-describedby="backup-hint" @click="downloadBackup()">{{ t("exportBackup") }}</Button>
        <p id="backup-hint" class="m-0 text-2xs text-fg-muted">{{ t("backupHint") }}</p>
      </div>
    </div>
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
