<template>
  <AdminListRow as="li" class="flex items-center gap-2.5">
    <span class="grid size-6.75 place-items-center rounded-md bg-accent-soft text-accent"><Icon name="check" :size="14" /></span>
    <div>
      <strong class="block text-caption">{{ eventName(event.event) }}</strong>
      <small class="mt-0.75 block text-2xs text-fg-muted">{{ formatDate(event.createdAt) }}</small>
    </div>
  </AdminListRow>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import AdminListRow from "@/features/admin/AdminListRow.vue";
import { createAdminFormat } from "@/features/admin/adminFormat";
import { useI18n } from "@/shared/i18n/useI18n";

defineProps<{ event: { event: string; createdAt: string } }>();

const { language, t } = useI18n();
const { eventName, formatDate } = createAdminFormat(language, t);
</script>
