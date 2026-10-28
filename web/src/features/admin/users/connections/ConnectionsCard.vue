<template>
  <AdminListCard
    :title="t('connectionHistory')"
    :lead="t('connectionHistoryLead')"
    :items="list.items"
    :key-of="(record) => record.id"
    :total="list.total"
    :empty-text="t('connectionEmpty')"
    empty-icon="activity"
    more-to="/admin/users/connections"
    :more-label="t('viewAllConnections')"
  >
    <template #row="{ item }"><ConnectionRow :record="item" /></template>
  </AdminListCard>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListCard from "@/features/admin/ui/AdminListCard.vue";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import ConnectionRow from "@/features/admin/users/connections/ConnectionRow.vue";
import { useAdminConnectionsStore } from "@/features/admin/users/connections/adminConnections";

const connections = useAdminConnectionsStore();
const { list } = storeToRefs(connections);
onMounted(() => connections.showPreview());
useLiveRefresh(() => connections.refreshLive(), 5000);

const { t } = useI18n();
</script>
