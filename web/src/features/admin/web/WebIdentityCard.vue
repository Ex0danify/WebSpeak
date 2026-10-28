<template>
  <AdminSection :title="t('siteIdentity')" :lead="t('siteIdentityLead')" :status="statuses.web" status-quiet>
    <SettingField :label="t('siteName')" field="siteName"
      ><Input v-model.trim="serverForm.siteName" maxlength="80" @change="scheduleSave('web')"
    /></SettingField>
    <SettingField :label="t('privacyNoticeUrl')" field="privacyNoticeUrl" :hint="t('privacyNoticeUrlHint')"
      ><Input
        v-model.trim="serverForm.privacyNoticeUrl"
        type="url"
        inputmode="url"
        maxlength="300"
        :placeholder="PRIVACY_URL_EXAMPLE"
        @change="scheduleSave('web')"
    /></SettingField>
    <div class="grid gap-2.5 rounded-lg border border-line bg-surface-0 p-3">
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(180px,1fr)] items-end gap-3 max-narrow:grid-cols-1 max-narrow:gap-1.5">
        <Field :label="t('welcomeLanguage')">
          <ListSelect v-model="welcomeLanguage" :items="welcomeLanguageOptions" />
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
          @change="scheduleSave('web')"
        />
      </SettingField>
    </div>
  </AdminSection>
</template>

<script setup lang="ts">
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { ListSelect } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { storeToRefs } from "pinia";
import SettingField from "@/features/admin/settings/SettingField.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { welcomeLanguageOptions } from "@/features/admin/settings/adminServerForm";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm, welcomeLanguage, selectedWelcomeText, selectedWelcomeLanguageLabel, selectedWelcomeDefault } = storeToRefs(settings);
const { statuses, scheduleSave } = settings;
const { t } = useI18n();

const PRIVACY_URL_EXAMPLE = "https://example.org/privacy";
</script>
