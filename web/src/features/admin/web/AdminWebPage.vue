<template>
  <AdminPage :title="t('web')" :lead="t('webLead')">
    <component :is="card.component" v-for="card in cards" :key="card.id" :class="card.class" />
  </AdminPage>
</template>

<script setup lang="ts">
import { useI18n } from "@/shared/i18n/useI18n";
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import WebIdentityCard from "@/features/admin/web/WebIdentityCard.vue";
import type { AdminPageCard } from "@/features/admin/ui/adminPage";

const { t } = useI18n();

const cards: AdminPageCard[] = [{ id: "identity", component: WebIdentityCard }];
</script>
