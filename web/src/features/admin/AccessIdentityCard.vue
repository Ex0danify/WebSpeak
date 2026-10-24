<template>
  <AdminSection :title="t('accessAndIdentity')" body-class="grid content-start gap-3">
    <div class="grid gap-2">
      <Label id="access-mode-label">{{ t("accessMode") }}</Label>
      <RadioGroup v-model="serverForm.accessMode" aria-labelledby="access-mode-label" class="gap-2.5">
        <Radio value="fixed" :class="choiceClass">
          <span class="block text-xs font-bold">{{ t("fixedMode") }}</span>
          <span class="mt-1 block text-2xs leading-[1.45] text-fg-muted">{{ t("fixedModeLead") }}</span>
        </Radio>
        <Radio value="open" :class="choiceClass">
          <span class="block text-xs font-bold">{{ t("openMode") }}</span>
          <span class="mt-1 block text-2xs leading-[1.45] text-fg-muted">{{ t("openModeLead") }}</span>
        </Radio>
      </RadioGroup>
    </div>
    <Field :label="t('siteName')"><Input v-model.trim="serverForm.siteName" maxlength="80" /></Field>
    <div class="grid gap-2.5 rounded-lg border border-line bg-surface-0 p-3">
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(180px,1fr)] items-end gap-3 max-narrow:grid-cols-1 max-narrow:gap-1.5">
        <Field :label="t('welcomeLanguage')">
          <Select v-model="welcomeLanguage"
            ><option v-for="option in welcomeLanguageOptions" :key="option.value" :value="option.value">{{ option.label }}</option></Select
          >
        </Field>
        <small class="text-2xs leading-normal text-fg-muted">{{ t("welcomeLanguageHint") }}</small>
      </div>
      <Field id="welcome-text" :label="`${t('welcomeText')} · ${selectedWelcomeLanguageLabel}`" :hint="t('welcomeFallbackHint')">
        <Textarea v-model="selectedWelcomeText" maxlength="500" :rows="4" :placeholder="selectedWelcomeDefault" />
      </Field>
    </div>
  </AdminSection>
</template>

<script setup lang="ts">
import { Field, Label } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Radio, RadioGroup } from "@/shared/ui/radio";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { storeToRefs } from "pinia";
import AdminSection from "@/features/admin/AdminSection.vue";
import { choiceClass } from "@/features/admin/adminClasses";
import { welcomeLanguageOptions } from "@/features/admin/adminServerForm";
import { useAdminServerSettingsStore } from "@/features/admin/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const { serverForm, welcomeLanguage, selectedWelcomeText, selectedWelcomeLanguageLabel, selectedWelcomeDefault } =
  storeToRefs(useAdminServerSettingsStore());
const { t } = useI18n();
</script>
