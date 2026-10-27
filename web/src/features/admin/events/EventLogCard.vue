<template>
  <AdminSection :title="t('adminEventLog')" :lead="t('eventLogLead')">
    <div v-if="!list.items.length" class="rounded-md border border-dashed border-line bg-surface-0 px-3 py-2.5 text-caption text-fg-muted">
      {{ t("eventLogEmpty") }}
    </div>
    <ul v-else class="m-0 grid list-none gap-2.5 p-0" :aria-label="t('adminEventLog')">
      <EventRow v-for="event in list.items" :key="event.id" :event="event" />
    </ul>
    <ListFooter :summary="t('listShowing', { shown: list.items.length, total: list.total })">
      <RouterLink to="/admin/diagnostics/events" class="text-caption font-bold whitespace-nowrap text-accent no-underline">{{
        t("viewAllEvents")
      }}</RouterLink>
    </ListFooter>
  </AdminSection>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { ListFooter } from "@/shared/ui/list";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
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
