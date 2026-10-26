<template>
  <AdminSection :title="t('accessAndIdentity')" :status="statuses.access" status-quiet>
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
    <SettingField :label="t('siteName')" field="siteName"
      ><Input v-model.trim="serverForm.siteName" maxlength="80" @change="scheduleSave('access')"
    /></SettingField>
    <div class="grid gap-2.5 rounded-lg border border-line bg-surface-0 p-3">
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(180px,1fr)] items-end gap-3 max-narrow:grid-cols-1 max-narrow:gap-1.5">
        <Field :label="t('welcomeLanguage')">
          <Select v-model="welcomeLanguage"
            ><option v-for="option in welcomeLanguageOptions" :key="option.value" :value="option.value">{{ option.label }}</option></Select
          >
        </Field>
        <small class="text-2xs leading-normal text-fg-muted">{{ t("welcomeLanguageHint") }}</small>
      </div>
      <SettingField
        id="welcome-text"
        field="welcomeText"
        :label="`${t('welcomeText')} · ${selectedWelcomeLanguageLabel}`"
        :hint="t('welcomeFallbackHint')"
      >
        <Textarea
          v-model="selectedWelcomeText"
          maxlength="500"
          :rows="4"
          :placeholder="selectedWelcomeDefault"
          @change="scheduleSave('access')"
        />
      </SettingField>
    </div>
  </AdminSection>
</template>

<script setup lang="ts">
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Radio, RadioGroup } from "@/shared/ui/radio";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { storeToRefs } from "pinia";
import SettingGroup from "@/features/admin/gateway/SettingGroup.vue";
import SettingField from "@/features/admin/gateway/SettingField.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { choiceClass } from "@/features/admin/ui/adminClasses";
import { welcomeLanguageOptions } from "@/features/admin/gateway/adminServerForm";
import { useAdminServerSettingsStore } from "@/features/admin/gateway/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm, welcomeLanguage, selectedWelcomeText, selectedWelcomeLanguageLabel, selectedWelcomeDefault } = storeToRefs(settings);
const { statuses, scheduleSave } = settings;
const { t } = useI18n();
</script>
