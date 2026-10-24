<template>
  <article class="rounded-lg border border-line bg-surface-1 px-4 py-3.5">
    <h3 class="text-md font-bold">{{ t("runtimeFacts") }}</h3>
    <dl class="mt-2.5 grid grid-cols-4 gap-2 max-desktop:grid-cols-2 max-narrow:grid-cols-1">
      <AdminListRow size="lg">
        <dt class="text-2xs text-fg-muted">{{ t("internalPort") }}</dt>
        <dd class="mt-1.25 text-xs font-bold">{{ serverForm.internalPort ?? "—" }}</dd>
      </AdminListRow>
    </dl>
  </article>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import AdminListRow from "@/features/admin/AdminListRow.vue";
import { useAdminServerSettingsStore } from "@/features/admin/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const { serverForm } = storeToRefs(useAdminServerSettingsStore());
const { t } = useI18n();
</script>
