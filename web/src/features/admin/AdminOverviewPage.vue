<template>
  <section class="page-content overview-page">
    <Banner v-if="overview.legacyConfigImported" class="import-notice py-2.5 text-xs leading-[normal]">
      {{ t('legacyImported') }}
      <template #actions><Button size="sm" variant="ghost" class="font-extrabold text-accent" @click="dismissLegacyNotice">{{ t('gotIt') }}</Button></template>
    </Banner>
    <div class="hero-status"><div><small>{{ t('systemStatus') }}</small><h2>{{ t('everythingRunning') }}</h2><p>{{ t('overviewLead') }}</p></div><Chip variant="success" dot class="bg-surface-1 max-[520px]:hidden">{{ t('running') }}</Chip></div>
    <div class="metric-grid"><Card as="article" flush class="leading-[normal]"><span class="metric-icon"><Icon name="activity" :size="20" /></span><small>{{ t('gateway') }}</small><strong>{{ overview.gateway.version || '—' }}</strong><em>{{ formatUptime(overview.gateway.uptimeSeconds) }}</em></Card><Card as="article" flush class="leading-[normal]"><span class="metric-icon"><Icon name="server" :size="20" /></span><small>{{ t('teamSpeakTarget') }}</small><strong>{{ overview.teamSpeak.target || '—' }}</strong><em>{{ targetStatusText }}</em></Card><Card as="article" flush class="leading-[normal]"><span class="metric-icon"><Icon name="users" :size="20" /></span><small>{{ t('activeSessions') }}</small><strong>{{ overview.sessions.active }} / {{ overview.sessions.limit }}</strong><em>{{ t('peakSessions', { count: overview.sessions.peak }) }}</em></Card></div>
    <div class="overview-columns"><Card as="article" flush class="overview-card target-health-card leading-[normal]"><header><div><h3>{{ t('targetHealth') }}</h3><p>{{ t('targetHealthLead') }}</p></div><RouterLink to="/admin/server">{{ t('manage') }}</RouterLink></header><dl><div><dt>{{ t('status') }}</dt><dd><i :class="overview.teamSpeak.status"></i>{{ targetStatusText }}</dd></div><div><dt>{{ t('lastTest') }}</dt><dd>{{ formatDate(overview.teamSpeak.lastTestAt) }}</dd></div><div><dt>{{ t('latency') }}</dt><dd>{{ overview.teamSpeak.latencyMs == null ? '—' : `${overview.teamSpeak.latencyMs} ms` }}</dd></div></dl></Card><article class="overview-card recent-events-card"><header><div><h3>{{ t('recentEvents') }}</h3><p>{{ t('recentEventsLead') }}</p></div></header><ul class="event-list"><li v-for="event in overview.recentEvents" :key="`${event.event}-${event.createdAt}`"><span><Icon name="check" :size="14" /></span><div><strong>{{ eventName(event.event) }}</strong><small>{{ formatDate(event.createdAt) }}</small></div></li><li v-if="!overview.recentEvents.length" class="empty-event">{{ t('noRecentEvents') }}</li></ul></article></div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { createAdminFormat } from "./adminFormat";
import { useAdminOverviewStore } from "./adminOverview";
import { useI18n } from "@/shared/i18n/useI18n";

const { language, t } = useI18n();
const { overview, dismissLegacyNotice } = useAdminOverviewStore();
const targetStatusText = computed(() => overview.teamSpeak.status === "reachable" ? t('reachable') : overview.teamSpeak.status === "unreachable" ? t('unreachable') : t('notTested'));
const { formatDate, formatUptime, eventName } = createAdminFormat(language, t);
</script>

<style scoped>
.overview-card { padding: 24px; background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 14px; }
.overview-card h3 { margin: 0; font-size: 15px; font-weight: 700; }
.overview-card dl { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin: 18px 0 0; }
.overview-card dl div { padding: 13px; background: var(--ws-surface-0); border-radius: 9px; }
.overview-card dt { color: var(--ws-fg-muted); font-size: 10px; }
.overview-card dd { margin: 5px 0 0; font-size: 12px; font-weight: 700; }
.import-notice { margin-bottom: 18px; }
.hero-status { display: flex; align-items: center; justify-content: space-between; padding: 30px; color: var(--ws-fg); background: var(--ws-accent-soft); border-radius: 16px; }
.hero-status small { color: var(--ws-fg-muted); font-size: 10px; font-weight: 800; letter-spacing: .1em; }
.hero-status h2 { margin: 9px 0 5px; font-size: 27px; font-weight: 700; }
.hero-status p { margin: 0; color: var(--ws-fg-muted); font-size: 12px; }
.metric-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin: 18px 0; }
.metric-grid article { position: relative; padding: 21px; background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 13px; }
.metric-grid .metric-icon { position: absolute; top: 17px; right: 17px; display: grid; place-items: center; width: 35px; height: 35px; color: color-mix(in srgb, var(--ws-accent) 85%, var(--ws-fg)); background: var(--ws-surface-2); border-radius: 9px; }
.metric-grid small, .metric-grid strong, .metric-grid em { display: block; }
.metric-grid small { color: var(--ws-fg-muted); font-size: 10px; }
.metric-grid strong { max-width: 80%; margin-top: 13px; overflow: hidden; font-size: 20px; text-overflow: ellipsis; white-space: nowrap; }
.metric-grid em { margin-top: 7px; color: var(--ws-fg-muted); font-size: 10px; font-style: normal; }
.overview-columns { display: grid; grid-template-columns: 1.05fr .95fr; gap: 18px; }
.overview-card header { display: flex; justify-content: space-between; }
.overview-card header p { margin: 5px 0 0; color: var(--ws-fg-muted); font-size: 10px; }
.overview-card header a { color: color-mix(in srgb, var(--ws-accent) 85%, var(--ws-fg)); font-size: 11px; font-weight: 700; text-decoration: none; }
.overview-card dl { grid-template-columns: 1fr 1fr; }
.overview-card dd { display: flex; align-items: center; gap: 7px; }
.overview-card dd i { width: 7px; height: 7px; background: var(--ws-line-strong); border-radius: 50%; }
.overview-card dd i.reachable { background: var(--ws-success); }
.overview-card dd i.unreachable { background: var(--ws-danger); }
.event-list { display: grid; gap: 10px; margin: 18px 0 0; padding: 0; list-style: none; }
.event-list li { display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--ws-surface-0); border-radius: 9px; }
.event-list li>span { display: grid; place-items: center; width: 27px; height: 27px; color: color-mix(in srgb, var(--ws-accent) 85%, var(--ws-fg)); background: var(--ws-accent-soft); border-radius: 8px; }
.event-list strong, .event-list small { display: block; }
.event-list strong { font-size: 11px; }
.event-list small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 9px; }
.event-list .empty-event { display: block; color: var(--ws-fg-muted); text-align: center; }
@media (max-width: 850px) {
  .overview-columns { grid-template-columns: 1fr; }
  .metric-grid { grid-template-columns: 1fr; }
  .hero-status { align-items: flex-start; gap: 20px; }
  .hero-status p { max-width: 75%; }
}
@media (max-width: 520px) {
  .overview-card { padding: 18px; }
  .overview-card dl { grid-template-columns: 1fr; }
  .hero-status { padding: 23px; }
}
.overview-page .import-notice{flex:0 0 auto;margin-top:0;margin-bottom:12px}
.overview-page .hero-status{flex:0 0 auto;padding:24px}
.overview-page .metric-grid{flex:0 0 auto;gap:12px;margin:14px 0}
.overview-page .metric-grid article{padding:18px}
.overview-page .overview-columns{flex:1 1 0;min-height:0;align-items:stretch;gap:14px}
.target-health-card{align-self:start}
.recent-events-card{display:flex;height:100%;min-height:0;flex-direction:column;overflow:hidden}
.recent-events-card .event-list{flex:1 1 auto;min-height:0;max-height:none;overflow-y:auto}
@media(max-width:850px){
  .overview-page .hero-status{padding:18px}
  .overview-page .hero-status h2{font-size:24px}
  .overview-page .metric-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}
  .overview-page .metric-grid article{padding:12px}
  .overview-page .metric-grid .metric-icon{top:10px;right:10px;width:28px;height:28px}
  .overview-page .metric-grid strong{margin-top:9px;font-size:15px}
  .overview-page .overview-columns{grid-template-rows:minmax(0,1fr) minmax(0,1fr);overflow:hidden}
  .overview-page .target-health-card{align-self:stretch;min-height:0;overflow-y:auto}
  .overview-page .recent-events-card{height:100%}
}
@media(max-width:850px){
  .overview-page .overview-columns{grid-template-rows:auto;overflow:visible}
  .overview-page .target-health-card,.overview-page .recent-events-card{height:auto;min-height:0;overflow:visible}
  .overview-page .recent-events-card .event-list{max-height:none;overflow:visible}
}
</style>
