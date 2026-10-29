<template>
  <AdminPage :title="title" :lead="lead" :back-to="backTo" :back-label="backLabel">
    <template #action>
      <div class="flex flex-wrap items-center gap-2">
        <slot name="action" />
        <RefreshButton :loading="loading" @click="emit('refresh')" />
      </div>
    </template>
    <Card padding="lg" body-class="grid content-start gap-4">
      <slot name="toolbar" />
      <AdminList v-bind="listProps" v-model:page="page">
        <template #row="{ item }"><slot name="row" :item="item" /></template>
        <template v-if="$slots.list" #list><slot name="list" /></template>
        <template v-if="$slots.footer" #footer><slot name="footer" /></template>
      </AdminList>
    </Card>
    <slot />
  </AdminPage>
</template>

<script setup lang="ts" generic="T">
import { computed } from "vue";
import { Card } from "@/shared/ui/card";
import AdminList from "@/features/admin/ui/AdminList.vue";
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import RefreshButton from "@/features/admin/ui/RefreshButton.vue";
import type { AdminListProps } from "@/features/admin/ui/adminList";

// A sub-view with the whole list: the filters in `toolbar`, then the rows paged. The list props go to AdminList.
// The default slot is for what belongs to the page but not to the card, like a dialog.
const props = defineProps<AdminListProps<T> & { title: string; lead?: string; backTo: string; backLabel: string; loading: boolean }>();
const page = defineModel<number>("page", { default: 1 });
const listProps = computed(() => ({ ...props, label: props.title }));
const emit = defineEmits<{ refresh: [] }>();
defineSlots<{
  row(props: { item: T }): unknown;
  list?(): unknown;
  toolbar?(): unknown;
  action?(): unknown;
  footer?(): unknown;
  default?(): unknown;
}>();
</script>
