<template>
  <section :class="adminPageWide">
    <AdminPageHeader :title="t('operations')" :lead="t('operationsLead')" class="mb-4">
      <Button variant="secondary" :loading="operationsLoading" @click="loadOperations()">
        <Icon v-if="!operationsLoading" name="refresh" :size="17" />{{ t("refresh") }}
      </Button>
    </AdminPageHeader>
    <Banner class="mb-3 shrink-0">{{ t("updateNotice", { version: operations.diagnostics.version || "—" }) }}</Banner>
    <div v-for="row in rows" :key="row.id" :class="row.class">
      <component :is="card.component" v-for="card in row.cards" :key="card.id" v-bind="card.props" :class="card.class" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminPageHeader from "@/features/admin/ui/AdminPageHeader.vue";
import { adminPageWide, type AdminPageCard } from "@/features/admin/ui/adminPage";
import { useAdminOperationsStore } from "@/features/admin/operations/adminOperations";
import AuditCard from "@/features/admin/operations/AuditCard.vue";
import DiagnosticsCard from "@/features/admin/operations/DiagnosticsCard.vue";
import InvitesCard from "@/features/admin/operations/InvitesCard.vue";
import LogViewerCard from "@/features/admin/operations/LogViewerCard.vue";
import SessionsCard from "@/features/admin/operations/SessionsCard.vue";

const operationsStore = useAdminOperationsStore();
const { operations, operationsLoading } = storeToRefs(operationsStore);
const { loadOperations } = operationsStore;
// The page loads its own data whenever it is entered.
onMounted(loadOperations);

const { t } = useI18n();

// The page is locked to the viewport: the first row has a fixed height, the second takes the rest, and every card scrolls inside itself.
const scrollCard = "min-h-0 overflow-y-auto max-desktop:overflow-visible";
const clipCard = "min-h-0 overflow-hidden max-desktop:overflow-visible";
const columnBody = "flex min-h-0 flex-col";
const fillList = "min-h-0 flex-1 basis-0 overflow-y-auto max-desktop:flex-none max-desktop:overflow-visible";

const rows: Array<{ id: string; class: string; cards: AdminPageCard[] }> = [
  {
    id: "people",
    class:
      "grid min-h-0 min-w-0 shrink-0 basis-62.5 grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)] gap-4.5 max-desktop:basis-auto max-desktop:grid-cols-1",
    cards: [
      {
        id: "sessions",
        component: SessionsCard,
        class: scrollCard,
        props: {
          listClass: "-mx-5.5 -mb-5.5 max-h-47.5 overflow-auto max-desktop:max-h-none max-narrow:-mx-4.5 max-narrow:-mb-4.5",
        },
      },
      {
        id: "invites",
        component: InvitesCard,
        class: scrollCard,
        props: {
          listClass: "max-h-33 overflow-y-auto max-desktop:max-h-none max-desktop:overflow-visible",
          inputClass: "h-8.5 px-2.5 py-1.75",
        },
      },
    ],
  },
  {
    id: "system",
    class:
      "mt-3.5 grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(210px,.9fr)_minmax(0,1.1fr)_minmax(210px,.9fr)] gap-4.5 max-desktop:flex-none max-desktop:grid-cols-1",
    cards: [
      { id: "diagnostics", component: DiagnosticsCard, class: scrollCard, props: { bodyClass: columnBody } },
      {
        id: "logs",
        component: LogViewerCard,
        class: clipCard,
        props: { bodyClass: columnBody, historyClass: "max-h-45 overflow-y-auto", entriesClass: fillList },
      },
      { id: "audit", component: AuditCard, class: clipCard, props: { bodyClass: columnBody, listClass: fillList } },
    ],
  },
];
</script>
