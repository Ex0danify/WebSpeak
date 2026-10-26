<template>
  <AdminSection :title="t('serverAccessMode')" :status="statuses.access" status-quiet>
    <SettingGroup v-slot="{ labelId }" :label="t('accessMode')" field="accessMode">
      <RadioGroup v-model="serverForm.accessMode" :aria-labelledby="labelId" class="gap-2.5" @update:model-value="scheduleSave('access')">
        <Radio value="fixed" :class="choiceClass">
          <span class="block text-xs font-bold">{{ t("fixedMode") }}</span>
          <span class="mt-1 block text-2xs leading-[1.45] text-fg-muted">{{ t("fixedModeLead") }}</span>
        </Radio>
        <Radio value="open" :class="choiceClass">
          <span class="block text-xs font-bold">{{ t("openMode") }}</span>
          <span class="mt-1 block text-2xs leading-[1.45] text-fg-muted">{{ t("openModeLead") }}</span>
        </Radio>
      </RadioGroup>
    </SettingGroup>
  </AdminSection>
</template>

<script setup lang="ts">
import { Radio, RadioGroup } from "@/shared/ui/radio";
import { storeToRefs } from "pinia";
import SettingGroup from "@/features/admin/settings/SettingGroup.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { choiceClass } from "@/features/admin/ui/adminClasses";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm } = storeToRefs(settings);
const { statuses, scheduleSave } = settings;
const { t } = useI18n();
</script>
