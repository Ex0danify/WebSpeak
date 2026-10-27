<template>
  <AdminPage :title="t('adminEventLog')" :lead="t('eventLogViewLead')" back-to="/admin/diagnostics" :back-label="t('diagnostics')">
    <template #action>
      <Button variant="secondary" :loading="list.loading" @click="loadEvents()">
        <Icon v-if="!list.loading" name="refresh" :size="17" />{{ t("refresh") }}
      </Button>
    </template>
    <Card padding="lg" body-class="grid content-start gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <Input
          v-model="searchText"
          type="search"
          :aria-label="t('eventSearch')"
          :placeholder="t('eventSearch')"
          autocomplete="off"
          class="max-w-72 min-w-44 flex-1 max-compact:max-w-none max-compact:basis-full"
        />
        <Select
          class="w-40"
          :model-value="list.range"
          :aria-label="t('eventRange')"
          @update:model-value="(value) => filter({ range: value as EventRange })"
        >
          <option v-for="option in ranges" :key="option.value" :value="option.value">{{ option.label }}</option>
        </Select>
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
      <div v-if="!list.items.length" class="grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted">
        <Icon name="search" :size="22" class="text-accent" />
        <span>{{ filtered ? t("eventLogNoMatch") : t("eventLogEmpty") }}</span>
      </div>
      <ul v-else class="m-0 grid list-none gap-2.5 p-0" :aria-label="t('adminEventLog')">
        <EventRow v-for="event in list.items" :key="event.id" :event="event" />
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
      <ListFooter :summary="t('listShowing', { shown: list.items.length, total: list.total })">
        <label class="flex items-center gap-2 text-2xs text-fg-muted">
          {{ t("eventPageSize") }}
          <Select class="w-20" :model-value="String(list.limit)" @update:model-value="(value) => setPageSize(Number(value))">
            <option v-for="size in EVENT_PAGE_SIZES" :key="size" :value="String(size)">{{ size }}</option>
          </Select>
        </label>
      </ListFooter>
    </Card>
  </AdminPage>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { ListFooter, Pager } from "@/shared/ui/list";
import { Popover } from "@/shared/ui/popover";
import { Select } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import type { AdminEventCategory, AdminEventSeverity } from "@/features/admin/core/adminTypes";
import EventRow from "@/features/admin/events/EventRow.vue";
import { EVENT_PAGE_SIZES, useAdminEventLogStore, type EventRange } from "@/features/admin/events/adminEventLog";

const SEARCH_DELAY_MS = 300;

const eventLog = useAdminEventLogStore();
const { list, pageCount, filtered } = storeToRefs(eventLog);
const { loadEvents, goToPage, setPageSize, filter, clearFilters } = eventLog;

const { t } = useI18n();

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
onMounted(() => eventLog.showPages());
onBeforeUnmount(() => clearTimeout(searchTimer));

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

const ranges = computed(() => [
  { value: "", label: t("eventRangeAll") },
  { value: "day", label: t("eventRangeDay") },
  { value: "week", label: t("eventRangeWeek") },
  { value: "month", label: t("eventRangeMonth") },
]);
</script>
