<template>
    <article class="settings-card relay-card">
      <div><h3>{{ t('relaySettings') }}</h3><p class="card-help">{{ t('relaySettingsLead') }}</p></div>
      <div v-if="!serverForm.relayNodes.length" class="relay-empty">{{ t('relayNodeEmpty') }}</div>
      <div class="relay-node-list">
        <div v-for="(relay, index) in serverForm.relayNodes" :key="relay.id" class="relay-node">
          <div class="relay-node-heading">
            <Checkbox v-model="relay.enabled" class="min-w-0"><strong class="block truncate text-xs">{{ relay.name || t('relayUnnamed') }}</strong></Checkbox>
            <Button variant="ghost" size="sm" class="text-[var(--color-danger)] hover:bg-danger-soft" @click="removeRelayNode(index)">{{ t('remove') }}</Button>
          </div>
          <div class="relay-fields">
            <Field :label="t('relayName')"><Input v-model.trim="relay.name" maxlength="80" :placeholder="t('relayNamePlaceholder')" /></Field>
            <Field :label="t('relayTarget')"><Input v-model.trim="relay.target" maxlength="300" :placeholder="t('relayTargetPlaceholder')" /></Field>
            <div class="password-row">
              <Field :label="t('relayToken')"><Input v-model="relay.token" type="password" autocomplete="off" :disabled="relay.tokenAction !== 'replace'" :placeholder="relay.hasToken ? t('relayTokenConfigured') : t('relayTokenPlaceholder')" /></Field>
              <Segmented v-model="relay.tokenAction" :aria-label="t('relayToken')" class="h-10 items-center self-end justify-self-start">
                <Segment value="replace">{{ t('change') }}</Segment>
                <Segment v-if="relay.hasToken" value="remove">{{ t('remove') }}</Segment>
              </Segmented>
            </div>
          </div>
        </div>
      </div>
      <Button variant="secondary" size="sm" class="relay-add" @click="addRelayNode()">{{ t('relayAdd') }}</Button>
      <small class="field-help">{{ t('relayManagedHint') }}</small>
    </article>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Segment, Segmented } from "@/shared/ui/tabs";
import { storeToRefs } from "pinia";
import { useAdminServerSettingsStore } from "./adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm } = storeToRefs(settings);
const { addRelayNode, removeRelayNode } = settings;
const { t } = useI18n();
</script>

<style scoped>
.settings-card h3 { margin: 0; font-size: 15px; font-weight: 700; }
.password-row { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 9px; }
@media (max-width: 520px) {
  .password-row { grid-template-columns: 1fr; }
}
.field-help { margin-top: -8px; color: var(--ws-fg-muted); font-size: 10px; }
.relay-card .card-help{margin:5px 0 0;color:var(--ws-fg-muted);font-size:10px;line-height:1.5}
.relay-node-list{display:grid;gap:10px}
.relay-node{display:grid;gap:10px;padding:12px;background:var(--ws-surface-0);border:1px solid var(--ws-line);border-radius:10px}
.relay-node-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
.relay-empty{padding:10px 12px;color:var(--ws-fg-muted);background:var(--ws-surface-0);border:1px dashed var(--ws-line);border-radius:9px;font-size:11px}
.relay-add{justify-self:start;min-height:34px;padding-inline:13px}
.relay-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.relay-fields .password-row{grid-column:1 / -1}
.relay-card .field-help{line-height:1.55}
@media(max-width:850px){.relay-fields{grid-template-columns:1fr}.relay-fields .password-row{grid-column:auto}}
.server-page .settings-card input{height:40px}
.relay-node,.relay-fields,.relay-node-heading,.password-row{min-width:0}
@media(min-width:851px){
  .relay-fields{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
}
</style>
