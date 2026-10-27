<template>
  <AdminPage :title="t('diagnostics')" :lead="t('diagnosticsLead')">
    <template #action>
      <Button variant="secondary" :loading="diagnosticsLoading" @click="loadDiagnostics()">
        <Icon v-if="!diagnosticsLoading" name="refresh" :size="17" />{{ t("refresh") }}
      </Button>
    </template>
    <Banner>{{ t("updateNotice", { version: diagnostics.facts.version || "—" }) }}</Banner>
    <div class="grid items-start gap-4 wide:grid-cols-2">
      <div v-for="column in columns" :key="column.id" class="grid min-w-0 content-start gap-4">
        <component :is="card.component" v-for="card in column.cards" :key="card.id" v-bind="card.props" />
      </div>
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
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import type { AdminPageCard } from "@/features/admin/ui/adminPage";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";
import DiagnosticsCard from "@/features/admin/diagnostics/DiagnosticsCard.vue";
import EventLogCard from "@/features/admin/events/EventLogCard.vue";
import RetentionCard from "@/features/admin/diagnostics/RetentionCard.vue";

const diagnosticsStore = useAdminDiagnosticsStore();
const { diagnostics, diagnosticsLoading } = storeToRefs(diagnosticsStore);
const { loadDiagnostics } = diagnosticsStore;
// The page loads its own data whenever it is entered.
onMounted(loadDiagnostics);
useLiveRefresh(() => loadDiagnostics(true), 15_000);

const { t } = useI18n();

// Two columns where there is room, each as tall as its cards, so a short card leaves no hole beside a tall one.
const columns: Array<{ id: string; cards: AdminPageCard[] }> = [
  {
    id: "system",
    cards: [
      { id: "facts", component: DiagnosticsCard },
      { id: "retention", component: RetentionCard },
    ],
  },
  { id: "events", cards: [{ id: "events", component: EventLogCard, props: { limit: 8 } }] },
];
</script>
