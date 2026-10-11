<template>
    <Card as="article" padding="sm" body-class="grid content-start gap-3">
      <h3 class="text-md font-bold">{{ t('teamSpeakTarget') }}</h3>
      <div class="grid grid-cols-[minmax(0,1fr)_132px] gap-3 max-narrow:grid-cols-1">
        <Field :label="t('serverAddress')"><Input v-model.trim="serverForm.address" :placeholder="t('serverPlaceholder')" /></Field>
        <Field :label="t('serverPort')"><Input v-model.trim="serverForm.port" inputmode="numeric" type="text" maxlength="5" :placeholder="t('serverPortPlaceholder')" /></Field>
      </div>
      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2.25 max-narrow:grid-cols-1">
        <Field :label="t('serverPassword')"><Input v-model="serverForm.serverPassword" type="password" autocomplete="off" :disabled="serverForm.passwordAction !== 'replace'" :placeholder="serverForm.hasPassword ? t('passwordConfigured') : t('passwordOptionalHint')" /></Field>
        <Segmented v-model="serverForm.passwordAction" :aria-label="t('serverPassword')" class="h-10 items-center self-end justify-self-start">
          <Segment value="replace">{{ t('change') }}</Segment>
          <Segment v-if="serverForm.hasPassword" value="remove">{{ t('remove') }}</Segment>
        </Segmented>
      </div>
      <Button variant="secondary" :loading="testing" @click="testServerConnection()"><Icon v-if="!testing" name="activity" :size="17" />{{ testing ? t('testing') : t('testConnection') }}</Button>
      <Banner v-if="testResult" :variant="testResult.ok ? 'info' : 'danger'" :icon="testResult.ok ? 'check' : 'close'" :title="testResultTitle">{{ testResultText }}</Banner>
    </Card>
</template>

<script setup lang="ts">
import { Card } from "@/shared/ui/card";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Segment, Segmented } from "@/shared/ui/tabs";
import { storeToRefs } from "pinia";
import { useAdminServerSettingsStore } from "./adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm, testing, testResult, testResultTitle, testResultText } = storeToRefs(settings);
const { testServerConnection } = settings;
const { t } = useI18n();
</script>
