<template>
  <div
    class="admin-root h-dvh min-h-0 overflow-hidden leading-[normal] max-desktop:h-auto max-desktop:min-h-dvh max-desktop:overflow-visible desktop:h-[calc(100dvh/var(--ui-scale))] desktop:max-h-[calc(100dvh/var(--ui-scale))] desktop:min-h-[calc(100dvh/var(--ui-scale))]"
  >
    <AdminShell />
    <Toaster :label="t('notifications')" :dismiss-label="t('close')" />
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
