<template>
  <div class="admin-root leading-[normal]">
    <AdminShell />
    <Toaster :label="t('notifications')" :dismiss-label="t('close')" class="max-desktop:pb-20" />
    <DialogHost :close-label="t('close')" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { Toaster } from "@/shared/ui/toast";
import { DialogHost } from "@/shared/ui/dialog";
import { AdminShell, registerAdminStores, useAdminSessionStore } from "@/features/admin";
import { useI18n } from "@/shared/i18n/useI18n";

const { t } = useI18n();
registerAdminStores();
const { loadAdminView } = useAdminSessionStore();

onMounted(loadAdminView);
</script>
