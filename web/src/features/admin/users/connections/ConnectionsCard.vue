<template>
  <AdminSection :title="t('connectionHistory')" :lead="t('connectionHistoryLead')">
    <div class="flex flex-wrap items-center gap-2">
      <Input
        v-model="searchText"
        type="search"
        :aria-label="t('connectionSearch')"
        :placeholder="t('connectionSearch')"
        autocomplete="off"
        class="max-w-72 min-w-44 flex-1 max-compact:max-w-none max-compact:basis-full"
      />
      <Select
        class="w-44"
        :model-value="list.status"
        :aria-label="t('connectionStatusFilter')"
        @update:model-value="(value) => filter({ status: value as ConnectionStatusFilter })"
      >
        <option value="">{{ t("connectionStatusAll") }}</option>
        <option v-for="status in statuses" :key="status" :value="status">{{ connectionStatusLabel(status) }}</option>
      </Select>
      <Button v-if="filtered" variant="ghost" class="ml-auto" @click="clearFilters()">{{ t("eventFiltersClear") }}</Button>
    </div>
    <div v-if="!list.items.length" class="grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted">
      <Icon name="activity" :size="22" class="text-accent" />
      <span>{{ filtered ? t("connectionNoMatch") : t("connectionEmpty") }}</span>
    </div>
    <ul v-else class="m-0 grid list-none gap-2.5 p-0" :aria-label="t('connectionHistory')">
      <ConnectionRow v-for="record in list.items" :key="record.id" :record="record" />
    </ul>
    <Pager
      v-if="pageCount > 1"
      :model-value="list.page"
      :page-count="pageCount"
      :label="t('pagerLabel')"
      :previous-label="t('pagePrevious')"
      :next-label="t('pageNext')"
      :first-label="t('pageFirst')"
      :last-label="t('pageLast')"
      :page-label="(number) => t('pageNumber', { page: number })"
      :summary="t('listPage', { page: list.page, count: pageCount })"
      @update:model-value="goToPage"
    />
    <ListFooter :summary="t('listShowing', { shown: list.items.length, total: list.total })" />
  </AdminSection>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { ListFooter, Pager } from "@/shared/ui/list";
import { Select } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import ConnectionRow from "@/features/admin/users/connections/ConnectionRow.vue";
import { useAdminConnectionsStore, type ConnectionStatusFilter } from "@/features/admin/users/connections/adminConnections";

const SEARCH_DELAY_MS = 300;

const connections = useAdminConnectionsStore();
const { list, pageCount, filtered } = storeToRefs(connections);
const { goToPage, filter, clearFilters } = connections;

const { language, t } = useI18n();
const { connectionStatusLabel } = createAdminFormat(language, t);
const statuses = ["active", "connecting", "disconnected", "failed"] as const;

// Typing asks the gateway only once it pauses, and a reset of the filters empties the box.
const searchText = ref("");
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchText, (value) => {
  clearTimeout(searchTimer);
  if (value.trim() === list.value.search.trim()) return;
  searchTimer = setTimeout(() => filter({ search: value }), SEARCH_DELAY_MS);
});
watch(
  () => list.value.search,
  (value) => {
    if (value.trim() !== searchText.value.trim()) searchText.value = value;
  },
);
onMounted(() => connections.loadConnections());
onBeforeUnmount(() => clearTimeout(searchTimer));
</script>
