<template>
  <AdminSection :title="t('runtimeFacts')">
    <dl class="grid grid-cols-2 gap-2 max-narrow:grid-cols-1">
      <AdminListRow size="lg">
        <dt class="text-2xs text-fg-muted">{{ t("internalPort") }}</dt>
        <dd class="mt-1.25 text-xs font-bold">{{ serverForm.internalPort ?? "—" }}</dd>
      </AdminListRow>
    </dl>
  </AdminSection>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminServerSettingsStore } from "@/features/admin/gateway/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const { serverForm } = storeToRefs(useAdminServerSettingsStore());
const { t } = useI18n();
</script>
