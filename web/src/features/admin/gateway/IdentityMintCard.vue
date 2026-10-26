<template>
  <AdminSection :title="t('identityMintLimits')" :lead="t('identityMintLimitsLead')" :status="statuses.mint" status-quiet>
    <div class="grid grid-cols-3 gap-2.5 max-narrow:grid-cols-1">
      <SettingField :label="t('identityMintMaxLevel')" field="identityMintMaxLevel"
        ><Input
          v-model.number="serverForm.identityMintMaxLevel"
          type="number"
          inputmode="numeric"
          min="1"
          max="24"
          @change="scheduleSave('mint')"
      /></SettingField>
      <SettingField :label="t('identityMintConcurrency')" field="identityMintConcurrency"
        ><Input
          v-model.number="serverForm.identityMintConcurrency"
          type="number"
          inputmode="numeric"
          min="1"
          max="8"
          @change="scheduleSave('mint')"
      /></SettingField>
      <SettingField :label="t('identityMintQueueDepth')" field="identityMintQueueDepth"
        ><Input
          v-model.number="serverForm.identityMintQueueDepth"
          type="number"
          inputmode="numeric"
          min="0"
          max="100"
          @change="scheduleSave('mint')"
      /></SettingField>
    </div>
  </AdminSection>
</template>

<script setup lang="ts">
import { Input } from "@/shared/ui/input";
import { storeToRefs } from "pinia";
import SettingField from "@/features/admin/settings/SettingField.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm } = storeToRefs(settings);
const { statuses, scheduleSave } = settings;
const { t } = useI18n();
</script>
