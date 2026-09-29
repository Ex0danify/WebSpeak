<template>
    <article class="settings-card">
      <h3>{{ t('teamSpeakTarget') }}</h3>
      <div class="target-fields">
        <Field :label="t('serverAddress')"><Input v-model.trim="serverForm.address" :placeholder="t('serverPlaceholder')" /></Field>
        <Field :label="t('serverPort')"><Input v-model.trim="serverForm.port" inputmode="numeric" type="text" maxlength="5" :placeholder="t('serverPortPlaceholder')" /></Field>
      </div>
      <div class="password-row">
        <Field :label="t('serverPassword')"><Input v-model="serverForm.serverPassword" type="password" autocomplete="off" :disabled="serverForm.passwordAction !== 'replace'" :placeholder="serverForm.hasPassword ? t('passwordConfigured') : t('passwordOptionalHint')" /></Field>
        <Segmented v-model="serverForm.passwordAction" :aria-label="t('serverPassword')" class="h-10 items-center self-end justify-self-start">
          <Segment value="replace">{{ t('change') }}</Segment>
          <Segment v-if="serverForm.hasPassword" value="remove">{{ t('remove') }}</Segment>
        </Segmented>
      </div>
      <Button variant="secondary" :loading="testing" @click="testServerConnection()"><Icon v-if="!testing" name="activity" :size="17" />{{ testing ? t('testing') : t('testConnection') }}</Button>
      <Banner v-if="testResult" :variant="testResult.ok ? 'info' : 'danger'" :icon="testResult.ok ? 'check' : 'close'" :title="testResultTitle">{{ testResultText }}</Banner>
    </article>
</template>

<script setup lang="ts">
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segment, Segmented } from "@/components/ui/tabs";
import { storeToRefs } from "pinia";
import { useAdminServerSettingsStore } from "@/stores/adminServerSettings";
import { useI18n } from "@/i18n/use-i18n";

const settings = useAdminServerSettingsStore();
const { serverForm, testing, testResult, testResultTitle, testResultText } = storeToRefs(settings);
const { testServerConnection } = settings;
const { t } = useI18n();
</script>

<style scoped>
.settings-card h3 { margin: 0; font-size: 15px; font-weight: 700; }
.password-row { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 9px; }
@media (max-width: 520px) {
  .password-row { grid-template-columns: 1fr; }
}
.target-fields{display:grid;grid-template-columns:minmax(0,1fr) 132px;gap:12px}
@media(max-width:520px){.target-fields{grid-template-columns:1fr}}
.server-page .settings-card input{height:40px}
.password-row{min-width:0}
</style>
