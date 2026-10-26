<template>
  <AdminPage :title="t('gateway')" :lead="t('gatewayLead')">
    <div class="grid items-start gap-4 wide:grid-cols-2">
      <div v-for="column in columns" :key="column.id" class="grid min-w-0 content-start gap-4">
        <component :is="card.component" v-for="card in column.cards" :key="card.id" :class="card.class" />
      </div>
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
import { useI18n } from "@/shared/i18n/useI18n";
import AccessIdentityCard from "@/features/admin/gateway/AccessIdentityCard.vue";
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import AdvancedSettingsCard from "@/features/admin/gateway/AdvancedSettingsCard.vue";
import RelayNodesCard from "@/features/admin/gateway/RelayNodesCard.vue";
import RuntimeFactsCard from "@/features/admin/gateway/RuntimeFactsCard.vue";
import ServersCard from "@/features/admin/gateway/ServersCard.vue";
import type { AdminPageCard } from "@/features/admin/ui/adminPage";

const { t } = useI18n();

// Two columns where there is room, each as tall as its cards, so a short card leaves no hole beside a tall one. One column
// reads in the order of the lists.
const columns: Array<{ id: string; cards: AdminPageCard[] }> = [
  {
    id: "access",
    cards: [
      { id: "servers", component: ServersCard },
      { id: "access", component: AccessIdentityCard },
    ],
  },
  {
    id: "transport",
    cards: [
      { id: "advanced", component: AdvancedSettingsCard },
      { id: "relay", component: RelayNodesCard },
      { id: "runtime", component: RuntimeFactsCard },
    ],
  },
];
</script>
