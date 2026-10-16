<template>
  <Card as="article" padding="lg" body-class="flex min-h-0 flex-col" class="min-h-0 overflow-y-auto max-desktop:overflow-visible">
    <header class="flex items-start justify-between gap-3.75">
      <div>
        <h3 class="text-md font-bold">{{ t("diagnostics") }}</h3>
        <p class="mt-1.25 text-2xs leading-tight text-fg-muted">{{ t("diagnosticsLead") }}</p>
      </div>
      <a class="text-2xs font-bold whitespace-nowrap text-accent no-underline" href="/api/admin/diagnostics/report">{{
        t("downloadReport")
      }}</a>
    </header>
    <dl class="my-4.5 grid grid-cols-2 gap-2.25 max-narrow:grid-cols-1">
      <div v-for="fact in diagnosticFacts" :key="fact.label" class="rounded-md bg-surface-0 p-2.5">
        <dt class="text-2xs text-fg-muted">{{ fact.label }}</dt>
        <dd class="mt-1 truncate text-caption font-bold">{{ fact.value }}</dd>
      </div>
    </dl>
    <Button variant="secondary" class="mt-auto" @click="downloadBackup()">{{ t("exportBackup") }}</Button>
  </Card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { VERSION_PREFIX } from "@/shared/lib/brand";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n/useI18n";
import { useAdminOperationsStore } from "@/features/admin/adminOperations";
import { useAdminOverviewStore } from "@/features/admin/adminOverview";

const { operations } = storeToRefs(useAdminOperationsStore());
const { downloadBackup } = useAdminOverviewStore();
const { t } = useI18n();

const diagnosticFacts = computed(() => {
  const d = operations.value.diagnostics;
  return [
    { label: t("version"), value: d.version || "—" },
    { label: t("runtime"), value: d.node || "—" },
    { label: t("platform"), value: `${d.platform || "—"} / ${d.arch || "—"}` },
    { label: t("databaseSchema"), value: `${VERSION_PREFIX}${d.schemaVersion || "—"}` },
    { label: t("createdSessions"), value: d.createdSessions },
  ];
});
</script>
