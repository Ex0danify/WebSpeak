<template>
  <AdminSection :title="t('advancedSettings')" :lead="t('advancedSettingsLead')" :status="statuses.advanced" status-quiet>
    <SettingChoice
      v-model="serverForm.webRtcEnabled"
      :title="t('webrtcEnabled')"
      :lead="t('webrtcEnabledLead')"
      field="webRtcEnabled"
      @update:model-value="handleWebRtcToggle()"
    />
    <div class="grid gap-2 rounded-lg border border-line bg-surface-0 p-3">
      <div>
        <strong class="block text-caption">{{ t("webrtcPortRange") }}</strong
        ><small class="mt-1 block text-2xs leading-[1.45] text-fg-muted">{{ t("webrtcPortRangeLead") }}</small>
      </div>
      <div class="grid grid-cols-2 gap-2.5 max-narrow:grid-cols-1">
        <SettingField :label="t('webrtcPortStart')" field="webRtcUdpStart"
          ><Input
            v-model.number="serverForm.webRtcUdpStart"
            type="number"
            inputmode="numeric"
            min="1024"
            max="65535"
            :disabled="serverForm.webRtcEnabled"
            @change="scheduleSave('advanced')"
        /></SettingField>
        <SettingField :label="t('webrtcPortEnd')" field="webRtcUdpEnd"
          ><Input
            v-model.number="serverForm.webRtcUdpEnd"
            type="number"
            inputmode="numeric"
            min="1024"
            max="65535"
            :disabled="serverForm.webRtcEnabled"
            @change="scheduleSave('advanced')"
        /></SettingField>
      </div>
    </div>
    <small class="-mt-2 text-2xs text-fg-muted">{{ t("webrtcApplyHint") }}</small>
    <div class="grid gap-2 rounded-lg border border-line bg-surface-0 p-3">
      <div>
        <strong class="block text-caption">{{ t("identityMintLimits") }}</strong
        ><small class="mt-1 block text-2xs leading-normal text-fg-muted">{{ t("identityMintLimitsLead") }}</small>
      </div>
      <div class="grid grid-cols-3 gap-2.5 max-narrow:grid-cols-1">
        <SettingField :label="t('identityMintMaxLevel')" field="identityMintMaxLevel"
          ><Input
            v-model.number="serverForm.identityMintMaxLevel"
            type="number"
            inputmode="numeric"
            min="1"
            max="24"
            @change="scheduleSave('advanced')"
        /></SettingField>
        <SettingField :label="t('identityMintConcurrency')" field="identityMintConcurrency"
          ><Input
            v-model.number="serverForm.identityMintConcurrency"
            type="number"
            inputmode="numeric"
            min="1"
            max="8"
            @change="scheduleSave('advanced')"
        /></SettingField>
        <SettingField :label="t('identityMintQueueDepth')" field="identityMintQueueDepth"
          ><Input
            v-model.number="serverForm.identityMintQueueDepth"
            type="number"
            inputmode="numeric"
            min="0"
            max="100"
            @change="scheduleSave('advanced')"
        /></SettingField>
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
import { Dialog } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { storeToRefs } from "pinia";
import SettingChoice from "@/features/admin/settings/SettingChoice.vue";
import SettingField from "@/features/admin/settings/SettingField.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm, webrtcPortNoticeOpen, webrtcPortRangeText } = storeToRefs(settings);
const { statuses, scheduleSave, handleWebRtcToggle } = settings;
const { t } = useI18n();
</script>
