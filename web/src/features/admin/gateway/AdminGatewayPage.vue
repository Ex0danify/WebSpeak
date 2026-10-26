<template>
  <AdminPage :title="t('gateway')" :lead="t('gatewayLead')">
    <ServersAccessCard />
    <div class="grid items-start gap-4 wide:grid-cols-2">
      <div v-for="column in columns" :key="column.id" class="grid min-w-0 content-start gap-4">
        <component :is="card.component" v-for="card in column.cards" :key="card.id" :class="card.class" />
      </div>
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
import { useI18n } from "@/shared/i18n/useI18n";
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import IdentityMintCard from "@/features/admin/gateway/IdentityMintCard.vue";
import RelayNodesCard from "@/features/admin/gateway/RelayNodesCard.vue";
import ServersAccessCard from "@/features/admin/gateway/ServersAccessCard.vue";
import WebRtcCard from "@/features/admin/gateway/WebRtcCard.vue";
import type { AdminPageCard } from "@/features/admin/ui/adminPage";

const { t } = useI18n();

// Two columns where there is room, each as tall as its cards, so a short card leaves no hole beside a tall one.
const columns: Array<{ id: string; cards: AdminPageCard[] }> = [
  {
    id: "transport",
    cards: [
      { id: "webrtc", component: WebRtcCard },
      { id: "mint", component: IdentityMintCard },
    ],
  },
  { id: "relay", cards: [{ id: "relay", component: RelayNodesCard }] },
];
</script>
