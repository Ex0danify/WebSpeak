<template>
  <section class="page-content server-page">
    <div class="page-heading"><div><h2>{{ t('serverSettings') }}</h2><p>{{ t('serverSettingsLead') }}</p></div><Button :loading="submitting" @click="saveServerSettings()">{{ submitting ? t('saving') : t('saveChanges') }}</Button></div>
    <div class="settings-grid">
      <TeamSpeakTargetCard />
      <AccessIdentityCard />
      <AdvancedSettingsCard />
      <RelayNodesCard />
    </div>
    <article class="readonly-card"><h3>{{ t('runtimeFacts') }}</h3><dl><div><dt>{{ t('lastTest') }}</dt><dd>{{ formatDate(serverForm.lastTestAt) }}</dd></div><div><dt>{{ t('latency') }}</dt><dd>{{ serverForm.lastTestLatencyMs == null ? '—' : `${serverForm.lastTestLatencyMs} ms` }}</dd></div><div><dt>{{ t('internalPort') }}</dt><dd>3040</dd></div></dl></article>
    <Dialog v-model="webrtcPortNoticeOpen" size="sm" :title="t('webrtcPortNoticeTitle')" :description="t('webrtcPortNotice', { range: webrtcPortRangeText })" :close-label="t('close')">
      <template #footer><Button class="w-full" @click="webrtcPortNoticeOpen = false">{{ t('gotIt') }}</Button></template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { createAdminFormat } from "@/lib/admin-format";
import { useI18n } from "@/i18n/use-i18n";
import { useAdminServerSettingsStore } from "@/stores/adminServerSettings";
import { useAdminSessionStore } from "@/stores/adminSession";
import AccessIdentityCard from "./AccessIdentityCard.vue";
import AdvancedSettingsCard from "./AdvancedSettingsCard.vue";
import RelayNodesCard from "./RelayNodesCard.vue";
import TeamSpeakTargetCard from "./TeamSpeakTargetCard.vue";

const settings = useAdminServerSettingsStore();
const { serverForm, webrtcPortNoticeOpen, webrtcPortRangeText } = storeToRefs(settings);
const { saveServerSettings } = settings;
const { submitting } = storeToRefs(useAdminSessionStore());

const { language, t } = useI18n();
const { formatDate } = createAdminFormat(language, t);
</script>

<style scoped>
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.page-heading h2 { margin: 0; font-size: 25px; font-weight: 700; }
.page-heading p { margin: 7px 0 0; color: var(--ws-fg-muted); font-size: 12px; }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.settings-card, .readonly-card { padding: 24px; background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 14px; }
.settings-card { display: grid; align-content: start; gap: 18px; }
.readonly-card h3 { margin: 0; font-size: 15px; font-weight: 700; }
.readonly-card { margin-top: 20px; }
.readonly-card dl { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin: 18px 0 0; }
.readonly-card dl div { padding: 13px; background: var(--ws-surface-0); border-radius: 9px; }
.readonly-card dt { color: var(--ws-fg-muted); font-size: 10px; }
.readonly-card dd { margin: 5px 0 0; font-size: 12px; font-weight: 700; }
@media (max-width: 850px) {
  .settings-grid { grid-template-columns: 1fr; }
  .readonly-card dl { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 520px) {
  .page-heading { gap: 15px; }
  .settings-card, .readonly-card { padding: 18px; }
  .readonly-card dl { grid-template-columns: 1fr; }
}
.server-page .page-heading{flex:0 0 auto;margin-bottom:14px}
.server-page .settings-grid{flex:1 1 auto;min-height:0;align-items:stretch;gap:14px}
.server-page .settings-card{min-height:0;overflow-y:auto;padding:20px}
.server-page .readonly-card{flex:0 0 auto;margin-top:14px;padding:16px 20px}
.server-page .readonly-card dl{gap:10px;margin-top:12px}
@media(max-width:850px){
  .page-heading{flex-wrap:wrap}
  .server-page .settings-grid{grid-template-columns:1fr;grid-auto-rows:minmax(190px,1fr);overflow-y:auto}
  .server-page .readonly-card dl{grid-template-columns:repeat(2,minmax(0,1fr))}
}
.advanced-card{grid-column:1 / -1}
.relay-card{grid-column:1 / -1}
@media(max-width:850px){.relay-card{grid-column:auto}}
@media(max-width:520px){.advanced-card{grid-column:auto}}
.server-page .settings-grid{flex:0 0 auto;min-height:auto;align-items:start;overflow:visible;grid-auto-rows:auto}
.server-page .settings-card{height:auto;min-height:0;overflow:visible;padding:16px;gap:12px}
.server-page .readonly-card{margin-top:12px;padding:14px 16px}
.server-page .readonly-card dl{gap:8px;margin-top:10px}
@media(max-width:850px){
  .server-page .settings-grid{overflow:visible;grid-auto-rows:auto}
  .server-page .settings-card{overflow:visible}
}
@media(max-width:850px){
  .server-page .settings-grid{height:auto;overflow:visible}
}
.settings-card,.relay-card{min-width:0}
@media(min-width:851px){
  .server-page .settings-grid{min-width:0}
  .settings-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
}
</style>
