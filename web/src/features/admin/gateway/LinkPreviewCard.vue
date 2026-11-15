<template>
  <AdminSection :title="t('linkPreviewLimits')" :lead="t('linkPreviewLimitsLead')" :status="statuses.previews" status-quiet>
    <div class="grid grid-cols-2 gap-2.5 max-narrow:grid-cols-1">
      <SettingField v-for="field in fields" :key="field.name" :label="field.label" :field="field.name"
        ><Input
          v-model.number="serverForm[field.name]"
          type="number"
          inputmode="numeric"
          :min="SETTING_LIMITS[field.name].min"
          :max="SETTING_LIMITS[field.name].max"
          @change="scheduleSave('previews')"
      /></SettingField>
    </div>
  </AdminSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { Input } from "@/shared/ui/input";
import { useI18n } from "@/shared/i18n/useI18n";
import SettingField from "@/features/admin/settings/SettingField.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { SETTING_LIMITS } from "@/features/admin/settings/adminServerDocument";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";

const settings = useAdminServerSettingsStore();
const { serverForm } = storeToRefs(settings);
const { statuses, scheduleSave } = settings;
const { t } = useI18n();

const fields = computed(
  () =>
    [
      { name: "linkPreviewImageKib", label: t("linkPreviewImageKib") },
      { name: "linkPreviewClickImageKib", label: t("linkPreviewClickImageKib") },
      { name: "linkPreviewSvgKib", label: t("linkPreviewSvgKib") },
      { name: "linkPreviewCacheKib", label: t("linkPreviewCacheKib") },
    ] as const,
);
</script>
