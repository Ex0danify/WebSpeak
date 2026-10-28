<template>
  <AdminSection :title="title" :lead="lead">
    <template v-if="$slots.action" #action><slot name="action" /></template>
    <AdminList v-bind="listProps" v-model:page="page">
      <template #row="{ item }"><slot name="row" :item="item" /></template>
      <template v-if="$slots.list" #list><slot name="list" /></template>
    </AdminList>
  </AdminSection>
</template>

<script setup lang="ts" generic="T">
import { computed } from "vue";
import AdminList from "@/features/admin/ui/AdminList.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import type { AdminListProps } from "@/features/admin/ui/adminList";

// A card with the newest rows of a list and the way to the full view. The list props go to AdminList.
const props = defineProps<AdminListProps<T> & { title: string; lead?: string }>();
const page = defineModel<number>("page", { default: 1 });
const listProps = computed(() => ({ ...props, label: props.title }));
defineSlots<{ row(props: { item: T }): unknown; list?(): unknown; action?(): unknown }>();
</script>
