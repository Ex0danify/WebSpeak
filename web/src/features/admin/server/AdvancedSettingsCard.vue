<template>
  <AdminSection :title="t('advancedSettings')" :lead="t('advancedSettingsLead')" body-class="grid content-start gap-3">
    <Checkbox v-model="serverForm.webRtcEnabled" :class="choiceClass" @update:model-value="handleWebRtcToggle()">
      <span class="block text-xs font-bold">{{ t("webrtcEnabled") }}</span>
      <span class="mt-1 block text-2xs leading-[1.45] text-fg-muted">{{ t("webrtcEnabledLead") }}</span>
    </Checkbox>
    <div class="grid gap-2 rounded-lg border border-line bg-surface-0 p-3">
      <div>
        <strong class="block text-caption">{{ t("webrtcPortRange") }}</strong
        ><small class="mt-1 block text-2xs leading-[1.45] text-fg-muted">{{ t("webrtcPortRangeLead") }}</small>
      </div>
      <div class="grid grid-cols-2 gap-2.5 max-narrow:grid-cols-1">
        <Field :label="t('webrtcPortStart')"
          ><Input
            v-model.number="serverForm.webRtcUdpStart"
            type="number"
            inputmode="numeric"
            min="1024"
            max="65535"
            :disabled="serverForm.webRtcEnabled"
        /></Field>
        <Field :label="t('webrtcPortEnd')"
          ><Input
            v-model.number="serverForm.webRtcUdpEnd"
            type="number"
            inputmode="numeric"
            min="1024"
            max="65535"
            :disabled="serverForm.webRtcEnabled"
        /></Field>
      </div>
    </div>
    <small class="-mt-2 text-2xs text-fg-muted">{{ t("webrtcApplyHint") }}</small>
    <div class="grid gap-2 rounded-lg border border-line bg-surface-0 p-3">
      <div>
        <strong class="block text-caption">{{ t("identityMintLimits") }}</strong
        ><small class="mt-1 block text-2xs leading-normal text-fg-muted">{{ t("identityMintLimitsLead") }}</small>
      </div>
      <div class="grid grid-cols-3 gap-2.5 max-narrow:grid-cols-1">
        <Field :label="t('identityMintMaxLevel')"
          ><Input v-model.number="serverForm.identityMintMaxLevel" type="number" inputmode="numeric" min="1" max="24"
        /></Field>
        <Field :label="t('identityMintConcurrency')"
          ><Input v-model.number="serverForm.identityMintConcurrency" type="number" inputmode="numeric" min="1" max="8"
        /></Field>
        <Field :label="t('identityMintQueueDepth')"
          ><Input v-model.number="serverForm.identityMintQueueDepth" type="number" inputmode="numeric" min="0" max="100"
        /></Field>
      </div>
    </div>
    <Dialog
      v-model="webrtcPortNoticeOpen"
      size="sm"
      :title="t('webrtcPortNoticeTitle')"
      :description="t('webrtcPortNotice', { range: webrtcPortRangeText })"
      :close-label="t('close')"
    >
      <template #footer
        ><Button class="w-full" @click="webrtcPortNoticeOpen = false">{{ t("gotIt") }}</Button></template
      >
    </Dialog>
  </AdminSection>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { storeToRefs } from "pinia";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { choiceClass } from "@/features/admin/ui/adminClasses";
import { useAdminServerSettingsStore } from "@/features/admin/server/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm, webrtcPortNoticeOpen, webrtcPortRangeText } = storeToRefs(settings);
const { handleWebRtcToggle } = settings;
const { t } = useI18n();
</script>
