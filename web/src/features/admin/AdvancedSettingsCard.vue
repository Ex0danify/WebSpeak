<template>
  <Card as="article" padding="sm" body-class="grid content-start gap-3" class="col-span-full">
    <div>
      <h3 class="m-0 text-md font-bold">{{ t("advancedSettings") }}</h3>
      <p class="mt-1.25 mb-0 text-2xs leading-normal text-fg-muted">{{ t("advancedSettingsLead") }}</p>
    </div>
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
  </Card>
</template>

<script setup lang="ts">
import { Card } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { storeToRefs } from "pinia";
import { useAdminServerSettingsStore } from "./adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm } = storeToRefs(settings);
const { handleWebRtcToggle } = settings;
const { t } = useI18n();
const choiceClass =
  "w-full rounded-md border border-line p-2.5 has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-surface-0";
</script>
