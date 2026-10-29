<template>
  <AdminSection :title="t('webrtcSettings')" :lead="t('webrtcSettingsLead')" :status="statuses.webrtc" status-quiet>
    <div class="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-0 p-3">
      <label for="webrtc-enabled" class="min-w-0 cursor-pointer">
        <span class="flex items-baseline gap-2"
          ><span class="text-xs font-bold">{{ t("webrtcEnabled") }}</span
          ><FieldSaved :status="fieldStatus('webRtcEnabled')" class="leading-none"
        /></span>
        <span class="mt-1 block text-2xs leading-snug text-fg-muted">{{ t("webrtcEnabledLead") }}</span>
      </label>
      <Switch id="webrtc-enabled" v-model="serverForm.webRtcEnabled" @update:model-value="scheduleSave('webrtc')" />
    </div>
    <div
      role="group"
      aria-labelledby="webrtc-range-title"
      :aria-describedby="serverForm.webRtcEnabled ? 'webrtc-range-locked' : undefined"
      class="grid gap-2 rounded-lg border border-line bg-surface-0 p-3"
    >
      <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div class="min-w-48 flex-1">
          <strong id="webrtc-range-title" class="block text-caption">{{ t("webrtcPortRange") }}</strong
          ><small class="mt-1 block text-2xs leading-[1.45] text-fg-muted">{{ t("webrtcPortRangeLead") }}</small>
        </div>
        <small
          id="webrtc-range-locked"
          :class="[
            'flex shrink-0 items-center gap-1.5 text-2xs leading-snug font-medium text-fg',
            !serverForm.webRtcEnabled && 'invisible',
          ]"
          ><Icon name="lock" :size="13" />{{ t("webrtcPortRangeLocked") }}</small
        >
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
            @change="scheduleSave('webrtc')"
        /></SettingField>
        <SettingField :label="t('webrtcPortEnd')" field="webRtcUdpEnd"
          ><Input
            v-model.number="serverForm.webRtcUdpEnd"
            type="number"
            inputmode="numeric"
            min="1024"
            max="65535"
            :disabled="serverForm.webRtcEnabled"
            @change="scheduleSave('webrtc')"
        /></SettingField>
      </div>
    </div>
    <div aria-live="polite">
      <div v-if="serverForm.webRtcEnabled" class="grid gap-2.5 rounded-lg border border-line bg-surface-0 p-3">
        <strong class="text-caption">{{ t("webrtcOpenPortsTitle") }}</strong>
        <div class="flex items-center gap-2">
          <code class="rounded-md border border-line bg-surface-1 px-2.5 py-1 font-mono text-xs font-bold">{{
            t("webrtcRangeUdp", { range: webrtcPortRangeText })
          }}</code>
        </div>
        <ul class="m-0 grid list-disc gap-0.5 pl-5 text-2xs text-fg-muted">
          <li>{{ t("webrtcOpenPortsHost") }}</li>
          <li>{{ t("webrtcOpenPortsGroup") }}</li>
          <li>{{ t("webrtcOpenPortsDocker") }}</li>
        </ul>
        <small class="text-2xs leading-snug text-fg-muted">{{ t("webrtcOpenPortsFallback") }}</small>
      </div>
    </div>
    <small class="-mt-2 text-2xs text-fg-muted">{{ t("webrtcApplyHint") }}</small>
  </AdminSection>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import { storeToRefs } from "pinia";
import FieldSaved from "@/features/admin/ui/FieldSaved.vue";
import SettingField from "@/features/admin/settings/SettingField.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm, webrtcPortRangeText } = storeToRefs(settings);
const { statuses, scheduleSave, fieldStatus } = settings;
const { t } = useI18n();
</script>
