<template>
  <Dialog v-model="dialog.open" size="md" :title="dialogTitle" :close-label="t('close')" :dismissible="!dialog.saving">
    <form id="server-form" class="grid gap-3" @submit.prevent="saveDialog()">
      <Banner v-if="dialog.error" variant="danger">{{ dialog.error }}</Banner>
      <Field :label="t('serverName')" :hint="t('serverNameHint')">
        <Input v-model.trim="dialog.name" maxlength="80" :placeholder="t('serverNamePlaceholder')" />
      </Field>
      <div class="grid grid-cols-[minmax(0,1fr)_132px] gap-3 max-narrow:grid-cols-1">
        <Field :label="t('serverAddress')"><Input v-model.trim="dialog.address" :placeholder="t('serverPlaceholder')" /></Field>
        <Field :label="t('serverPort')"
          ><Input v-model.trim="dialog.port" inputmode="numeric" type="text" maxlength="5" :placeholder="t('serverPortPlaceholder')"
        /></Field>
      </div>
      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2.25 max-narrow:grid-cols-1">
        <Field :label="t('serverPassword')"
          ><Input
            v-model="dialog.serverPassword"
            type="password"
            autocomplete="off"
            :disabled="dialog.passwordAction !== 'replace'"
            :placeholder="dialog.hasPassword ? t('passwordConfigured') : t('passwordOptionalHint')"
        /></Field>
        <Segmented
          v-if="dialog.id"
          v-model="dialog.passwordAction"
          :aria-label="t('serverPassword')"
          class="h-10 items-center self-end justify-self-start"
        >
          <Segment value="keep">{{ t("keep") }}</Segment>
          <Segment value="replace">{{ t("change") }}</Segment>
          <Segment v-if="dialog.hasPassword" value="remove">{{ t("remove") }}</Segment>
        </Segmented>
      </div>
      <Button variant="secondary" :loading="testing" :disabled="!dialog.address.trim()" @click="testDialogConnection()"
        ><Icon v-if="!testing" name="activity" :size="17" />{{ testing ? t("testing") : t("testConnection") }}</Button
      >
      <Banner
        v-if="testResult"
        :variant="testResult.ok ? 'info' : 'danger'"
        :icon="testResult.ok ? 'check' : 'close'"
        :title="testResultTitle"
        >{{ testResultText }}</Banner
      >
    </form>
    <template #footer>
      <Button variant="ghost" :disabled="dialog.saving" @click="dialog.open = false">{{ t("confirmCancel") }}</Button>
      <Button type="submit" form="server-form" :loading="dialog.saving">{{ dialog.saving ? t("saving") : t("save") }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Segment, Segmented } from "@/shared/ui/tabs";
import { useAdminServerDialogStore } from "@/features/admin/adminServerDialog";
import { useI18n } from "@/shared/i18n/useI18n";

const store = useAdminServerDialogStore();
const { dialog, dialogTitle, testing, testResult, testResultTitle, testResultText } = storeToRefs(store);
const { saveDialog, testDialogConnection } = store;
const { t } = useI18n();
</script>
