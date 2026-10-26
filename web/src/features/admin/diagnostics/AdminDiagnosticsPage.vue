<template>
  <AdminPage :title="t('diagnostics')" :lead="t('diagnosticsLead')">
    <template #action>
      <Button variant="secondary" :loading="diagnosticsLoading" @click="loadDiagnostics()">
        <Icon v-if="!diagnosticsLoading" name="refresh" :size="17" />{{ t("refresh") }}
      </Button>
    </template>
    <Banner>{{ t("updateNotice", { version: diagnostics.facts.version || "—" }) }}</Banner>
    <div v-for="row in rows" :key="row.id" :class="row.class">
      <component :is="card.component" v-for="card in row.cards" :key="card.id" />
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import type { AdminPageCard } from "@/features/admin/ui/adminPage";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";
import AuditCard from "@/features/admin/diagnostics/AuditCard.vue";
import DiagnosticsCard from "@/features/admin/diagnostics/DiagnosticsCard.vue";
import LogViewerCard from "@/features/admin/diagnostics/LogViewerCard.vue";

const diagnosticsStore = useAdminDiagnosticsStore();
const { diagnostics, diagnosticsLoading } = storeToRefs(diagnosticsStore);
const { loadDiagnostics } = diagnosticsStore;
// The page loads its own data whenever it is entered.
onMounted(loadDiagnostics);

const { t } = useI18n();

// The facts and the audit trail side by side, the logs below across the whole width.
const rows: Array<{ id: string; class?: string; cards: AdminPageCard[] }> = [
  {
    id: "system",
    class: "grid items-start gap-4 wide:grid-cols-2",
    cards: [
      { id: "facts", component: DiagnosticsCard },
      { id: "audit", component: AuditCard },
    ],
  },
  { id: "logs", cards: [{ id: "logs", component: LogViewerCard }] },
];
</script>
