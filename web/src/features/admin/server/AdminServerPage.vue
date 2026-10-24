<template>
  <section :class="adminPageScroll">
    <AdminPageHeader :title="t('serverSettings')" :lead="t('serverSettingsLead')" class="mb-3.5">
      <Button :loading="savingSettings" @click="saveServerSettings()">{{ savingSettings ? t("saving") : t("saveChanges") }}</Button>
    </AdminPageHeader>
    <div class="grid min-w-0 shrink-0 grid-cols-2 items-start gap-3.5 max-desktop:grid-cols-1">
      <component :is="card.component" v-for="card in cards" :key="card.id" :class="card.class" />
    </div>
    <RuntimeFactsCard class="mt-3 shrink-0" />
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { useI18n } from "@/shared/i18n/useI18n";
import AccessIdentityCard from "@/features/admin/server/AccessIdentityCard.vue";
import AdminPageHeader from "@/features/admin/ui/AdminPageHeader.vue";
import AdvancedSettingsCard from "@/features/admin/server/AdvancedSettingsCard.vue";
import RelayNodesCard from "@/features/admin/server/RelayNodesCard.vue";
import RuntimeFactsCard from "@/features/admin/server/RuntimeFactsCard.vue";
import ServersCard from "@/features/admin/server/ServersCard.vue";
import { adminPageScroll, type AdminPageCard } from "@/features/admin/ui/adminPage";
import { useAdminServerSettingsStore } from "@/features/admin/server/adminServerSettings";

const settings = useAdminServerSettingsStore();
const { savingSettings } = storeToRefs(settings);
const { saveServerSettings } = settings;
const { t } = useI18n();

const cards: AdminPageCard[] = [
  { id: "servers", component: ServersCard },
  { id: "access", component: AccessIdentityCard },
  { id: "advanced", component: AdvancedSettingsCard, class: "col-span-full" },
  { id: "relay", component: RelayNodesCard, class: "col-span-full" },
];
</script>
