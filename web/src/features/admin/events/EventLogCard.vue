<template>
  <AdminListCard
    :title="t('adminEventLog')"
    :lead="t('eventLogLead')"
    :items="list.items"
    :key-of="(event) => event.id"
    :total="list.total"
    :empty-text="t('eventLogEmpty')"
    empty-icon="search"
    more-to="/admin/diagnostics/events"
    :more-label="t('viewAllEvents')"
  >
    <template #row="{ item }"><EventRow :event="item" /></template>
  </AdminListCard>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListCard from "@/features/admin/ui/AdminListCard.vue";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import EventRow from "@/features/admin/events/EventRow.vue";
import { useAdminEventLogStore } from "@/features/admin/events/adminEventLog";

// The newest few events, the log has its own view. The page that shows the card says how many fit.
const props = defineProps<{ limit: number }>();

const eventLog = useAdminEventLogStore();
const { list } = storeToRefs(eventLog);
onMounted(() => eventLog.showPreview(props.limit));
useLiveRefresh(() => eventLog.refreshLive(), 5000);

const { t } = useI18n();
</script>
