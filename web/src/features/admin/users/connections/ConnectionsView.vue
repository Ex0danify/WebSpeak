<template>
  <AdminListView
    :title="t('connectionHistory')"
    :lead="t('connectionHistoryLead')"
    back-to="/admin/users"
    :back-label="t('users')"
    :loading="list.loading"
    :items="list.items"
    :key-of="(record) => record.id"
    :total="list.total"
    :empty-text="filtered ? t('connectionNoMatch') : t('connectionEmpty')"
    empty-icon="activity"
    :page="list.page"
    :page-count="pageCount"
    @update:page="goToPage"
    @refresh="loadConnections()"
  >
    <template #toolbar>
      <div class="flex flex-wrap items-center gap-2">
        <Input
          v-model="searchText"
          type="search"
          :aria-label="t('connectionSearch')"
          :placeholder="t('connectionSearch')"
          autocomplete="off"
          class="max-w-72 min-w-44 flex-1 max-compact:max-w-none max-compact:basis-full"
        />
        <ListSelect
          class="w-44"
          :model-value="list.status"
          :items="statusItems"
          :aria-label="t('connectionStatusFilter')"
          @update:model-value="(value) => filter({ status: value as ConnectionStatusFilter })"
        />
        <Button v-if="filtered" variant="ghost" class="ml-auto" @click="clearFilters()">{{ t("eventFiltersClear") }}</Button>
      </div>
    </template>
    <template #row="{ item }"><ConnectionRow :record="item" /></template>
  </AdminListView>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ListSelect, type ListSelectItem } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListView from "@/features/admin/ui/AdminListView.vue";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import { useDebouncedSearch } from "@/features/admin/core/useDebouncedSearch";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import ConnectionRow from "@/features/admin/users/connections/ConnectionRow.vue";
import { useAdminConnectionsStore, type ConnectionStatusFilter } from "@/features/admin/users/connections/adminConnections";

const connections = useAdminConnectionsStore();
const { list, pageCount, filtered } = storeToRefs(connections);
const { loadConnections, goToPage, filter, clearFilters } = connections;

const { language, t } = useI18n();
const { connectionStatusLabel } = createAdminFormat(language, t);
const statusItems = computed<ListSelectItem[]>(() => [
  { value: "ended", label: t("connectionStatusEnded") },
  { value: "disconnected", label: connectionStatusLabel("disconnected") },
  { value: "failed", label: connectionStatusLabel("failed") },
]);

const searchText = useDebouncedSearch(
  () => list.value.search,
  (search) => filter({ search }),
);
onMounted(() => connections.showPages());
useLiveRefresh(() => connections.refreshLive(), 5000);
</script>
