<template>
  <AdminListView
    :title="t('adminEventLog')"
    :lead="t('eventLogViewLead')"
    back-to="/admin/diagnostics"
    :back-label="t('diagnostics')"
    :loading="list.loading"
    :items="list.items"
    :key-of="(event) => event.id"
    :total="list.total"
    :empty-text="filtered ? t('eventLogNoMatch') : t('eventLogEmpty')"
    empty-icon="search"
    :page="list.page"
    :page-count="pageCount"
    @update:page="goToPage"
    @refresh="loadEvents()"
  >
    <template #toolbar>
      <div class="flex flex-wrap items-center gap-2">
        <Input
          v-model="searchText"
          type="search"
          :aria-label="t('eventSearch')"
          :placeholder="t('eventSearch')"
          autocomplete="off"
          class="max-w-72 min-w-44 flex-1 max-compact:max-w-none max-compact:basis-full"
        />
        <ListSelect
          class="w-40"
          :model-value="list.range"
          :items="ranges"
          :aria-label="t('eventRange')"
          @update:model-value="(value) => filter({ range: value as EventRange })"
        />
        <Popover align="start" class="w-64" :label="t('eventSeverityFilter')">
          <template #trigger>
            <Button variant="outline">
              {{ t("eventSeveritiesButton", { shown: list.severities.length, total: severities.length }) }}
              <Icon name="chevron-down" :size="16" />
            </Button>
          </template>
          <fieldset class="m-0 grid min-w-0 gap-2.5 border-0 p-0">
            <legend class="mb-2 p-0 text-2xs font-semibold text-fg-muted">{{ t("eventCategories") }}</legend>
            <Checkbox
              v-for="severity in severities"
              :key="severity.value"
              :model-value="list.severities"
              :value="severity.value"
              @update:model-value="(value) => filter({ severities: value as AdminEventSeverity[] })"
              >{{ severity.label }}</Checkbox
            >
          </fieldset>
        </Popover>
        <Popover align="start" class="w-64">
          <template #trigger>
            <Button variant="outline">
              {{ t("eventCategoriesButton", { shown: list.categories.length, total: categories.length }) }}
              <Icon name="chevron-down" :size="16" />
            </Button>
          </template>
          <fieldset class="m-0 grid min-w-0 gap-2.5 border-0 p-0">
            <legend class="mb-2 p-0 text-2xs font-semibold text-fg-muted">{{ t("eventCategories") }}</legend>
            <Checkbox
              v-for="category in categories"
              :key="category.value"
              :model-value="list.categories"
              :value="category.value"
              @update:model-value="(value) => filter({ categories: value as AdminEventCategory[] })"
              >{{ category.label }}</Checkbox
            >
          </fieldset>
        </Popover>
        <Button v-if="filtered" variant="ghost" class="ml-auto" @click="clearFilters()">{{ t("eventFiltersClear") }}</Button>
      </div>
    </template>
    <template #row="{ item }"><EventRow :event="item" /></template>
    <template #footer>
      <label class="flex items-center gap-2 text-2xs text-fg-muted">
        {{ t("eventPageSize") }}
        <ListSelect
          class="w-24"
          :model-value="String(list.limit)"
          :items="pageSizes"
          :aria-label="t('eventPageSize')"
          @update:model-value="(value) => setPageSize(Number(value))"
        />
      </label>
    </template>
  </AdminListView>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Popover } from "@/shared/ui/popover";
import { ListSelect, type ListSelectItem } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListView from "@/features/admin/ui/AdminListView.vue";
import { useDebouncedSearch } from "@/features/admin/core/useDebouncedSearch";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import type { AdminEventCategory, AdminEventSeverity } from "@/features/admin/core/adminTypes";
import EventRow from "@/features/admin/events/EventRow.vue";
import { EVENT_PAGE_SIZES, useAdminEventLogStore, type EventRange } from "@/features/admin/events/adminEventLog";

const eventLog = useAdminEventLogStore();
const { list, pageCount, filtered } = storeToRefs(eventLog);
const { loadEvents, goToPage, setPageSize, filter, clearFilters } = eventLog;

const { t } = useI18n();

const searchText = useDebouncedSearch(
  () => list.value.search,
  (search) => filter({ search }),
);
onMounted(() => eventLog.showPages());
useLiveRefresh(() => eventLog.refreshLive(), 5000);

const categories = computed(() => [
  { value: "auth", label: t("eventCategoryAuth") },
  { value: "config", label: t("eventCategoryConfig") },
  { value: "invites", label: t("eventCategoryInvites") },
  { value: "availability", label: t("eventCategoryAvailability") },
  { value: "sessions", label: t("eventCategorySessions") },
  { value: "system", label: t("eventCategorySystem") },
]);

const severities = computed(() => [
  { value: "info", label: t("eventSeverityInfo") },
  { value: "warning", label: t("eventSeverityWarning") },
  { value: "error", label: t("eventSeverityError") },
]);

const pageSizes: ListSelectItem[] = EVENT_PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }));

const ranges = computed<ListSelectItem[]>(() => [
  { value: "", label: t("eventRangeAll") },
  { value: "day", label: t("eventRangeDay") },
  { value: "week", label: t("eventRangeWeek") },
  { value: "month", label: t("eventRangeMonth") },
]);
</script>
