<template>
  <AdminSection :title="t('retentionSettings')" :lead="t('retentionSettingsLead')" :status="statuses.retention" status-quiet>
    <div class="grid grid-cols-2 gap-3 max-narrow:grid-cols-1">
      <fieldset v-for="group in groups" :key="group.id" class="m-0 grid min-w-0 content-start gap-2.5 rounded-lg border border-line p-3">
        <legend class="px-1 text-caption font-bold">{{ group.title }}</legend>
        <div class="grid grid-cols-2 gap-2.5 max-compact:grid-cols-1">
          <SettingField v-for="field in group.fields" :key="field.name" :label="field.label" :field="field.name"
            ><Input
              v-model.number="serverForm[field.name]"
              type="number"
              inputmode="numeric"
              :min="SETTING_LIMITS[field.name].min"
              :max="SETTING_LIMITS[field.name].max"
              @change="scheduleSave('retention')"
          /></SettingField>
        </div>
      </fieldset>
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

const groups = computed(
  () =>
    [
      {
        id: "events",
        title: t("retentionEventLog"),
        fields: [
          { name: "eventLogRetentionDays", label: t("retentionDays") },
          { name: "eventLogMaxRows", label: t("retentionMaxRows") },
        ],
      },
      {
        id: "connections",
        title: t("retentionConnections"),
        fields: [
          { name: "connectionRetentionDays", label: t("retentionDays") },
          { name: "connectionMaxRows", label: t("retentionMaxRows") },
        ],
      },
      {
        id: "logs",
        title: t("retentionLogs"),
        fields: [{ name: "logRetentionDays", label: t("retentionDays") }],
      },
    ] as const,
);
</script>
