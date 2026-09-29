<template>
    <article class="settings-card advanced-card">
      <div><h3>{{ t('advancedSettings') }}</h3><p class="card-help">{{ t('advancedSettingsLead') }}</p></div>
      <Checkbox v-model="serverForm.webRtcEnabled" :class="choiceClass" @update:model-value="handleWebRtcToggle()">
        <span class="block text-xs font-bold">{{ t('webrtcEnabled') }}</span>
        <span class="mt-1 block text-[10px] leading-[1.45] text-fg-muted">{{ t('webrtcEnabledLead') }}</span>
      </Checkbox>
      <div class="webrtc-port-fields">
        <div class="port-fields-heading"><strong>{{ t('webrtcPortRange') }}</strong><small>{{ t('webrtcPortRangeLead') }}</small></div>
        <div class="port-inputs">
          <Field :label="t('webrtcPortStart')"><Input v-model.number="serverForm.webRtcUdpStart" type="number" inputmode="numeric" min="1024" max="65535" :disabled="serverForm.webRtcEnabled" /></Field>
          <Field :label="t('webrtcPortEnd')"><Input v-model.number="serverForm.webRtcUdpEnd" type="number" inputmode="numeric" min="1024" max="65535" :disabled="serverForm.webRtcEnabled" /></Field>
        </div>
      </div>
      <small class="field-help">{{ t('webrtcApplyHint') }}</small>
    </article>
</template>

<script setup lang="ts">
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { storeToRefs } from "pinia";
import { useAdminServerSettingsStore } from "@/stores/adminServerSettings";
import { useI18n } from "@/i18n/use-i18n";

const settings = useAdminServerSettingsStore();
const { serverForm } = storeToRefs(settings);
const { handleWebRtcToggle } = settings;
const { t } = useI18n();
const choiceClass = "w-full rounded-md border border-line p-2.5 has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-surface-0";
</script>

<style scoped>
.settings-card h3 { margin: 0; font-size: 15px; font-weight: 700; }
.field-help { margin-top: -8px; color: var(--ws-fg-muted); font-size: 10px; }
.advanced-card .card-help{margin:5px 0 0;color:var(--ws-fg-muted);font-size:10px;line-height:1.5}
.webrtc-port-fields{display:grid;gap:10px;padding:14px;background:var(--ws-surface-0);border:1px solid var(--ws-line);border-radius:10px}
.port-fields-heading strong,.port-fields-heading small{display:block}
.port-fields-heading strong{font-size:11px}
.port-fields-heading small{margin-top:4px;color:var(--ws-fg-muted);font-size:10px;line-height:1.45}
.port-inputs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:520px){.port-inputs{grid-template-columns:1fr}}
.server-page .settings-card input{height:40px}
.server-page .webrtc-port-fields{padding:12px;gap:8px}
</style>
