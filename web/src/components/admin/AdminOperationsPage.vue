<template>
  <section class="page-content operations-page">
    <div class="page-heading"><div><h2>{{ t('operations') }}</h2><p>{{ t('operationsLead') }}</p></div><Button variant="secondary" :loading="operationsLoading" @click="loadOperations()"><Icon v-if="!operationsLoading" name="refresh" :size="17" />{{ t('refresh') }}</Button></div>
    <Banner class="system-notice py-2.5 text-xs leading-[normal]">{{ t('updateNotice', { version: operations.diagnostics.version || '—' }) }}</Banner>
    <div class="operations-grid operations-primary">
      <article class="operation-card operation-wide"><header><div><h3>{{ t('sessions') }}</h3><p>{{ t('sessionsLead') }}</p></div><strong>{{ operations.sessions.length }}</strong></header><div v-if="operations.sessions.length" class="table-wrap"><table><thead><tr><th>{{ t('sessionNickname') }}</th><th>{{ t('sessionState') }}</th><th>{{ t('age') }}</th><th>{{ t('memberCount') }}</th><th><span class="sr-only">{{ t('sessionActions') }}</span></th></tr></thead><tbody><tr v-for="session in operations.sessions" :key="session.id"><td><strong>{{ session.nickname }}</strong><small>{{ session.target }}</small></td><td><Chip variant="accent">{{ sessionStateLabel(session.state) }}</Chip></td><td>{{ formatAge(session.ageSeconds) }}</td><td>{{ session.memberCount }}</td><td><Button variant="ghost" size="sm" :class="dangerSoftClass" :disabled="terminatingSession === session.id" @click="terminateSession(session)">{{ terminatingSession === session.id ? t('terminating') : t('endSession') }}</Button></td></tr></tbody></table></div><div v-else class="operation-empty"><Icon name="users" :size="22" /><span>{{ t('sessionEmpty') }}</span></div></article>
      <article class="operation-card"><header><div><h3>{{ t('invites') }}</h3><p>{{ t('invitesLead') }}</p></div></header><form class="invite-form" @submit.prevent="createInvite()">
          <Field :label="t('inviteChannel')" class="gap-1"><Input v-model.trim="inviteForm.channel" :input-class="inviteInputClass" maxlength="100" :placeholder="t('inviteChannelPlaceholder')" /></Field>
          <div class="invite-form-grid">
            <Field :label="t('expiresIn')" class="gap-1"><Input v-model.number="inviteForm.expiresInHours" :input-class="inviteInputClass" type="number" min="1" max="720" /></Field>
            <Field :label="t('maxUses')" class="gap-1"><Input v-model.number="inviteForm.maxUses" :input-class="inviteInputClass" type="number" min="0" max="10000" /></Field>
          </div>
          <small class="field-help">{{ t('unlimitedUses') }}</small>
          <Button type="submit" size="sm" :loading="submitting">{{ t('createInvite') }}</Button>
        </form><div v-if="createdInvite" class="generated-invite"><strong>{{ t('inviteCreated') }}</strong><div class="generated-link"><Input :model-value="createdInvite.link" readonly :aria-label="t('inviteCreated')" input-class="h-9 px-2 text-[10px]" /><Button variant="secondary" class="h-9 px-2.5 text-[10px]" @click="copyInviteLink()">{{ t('copyLink') }}</Button></div><small>{{ t('inviteSecurity') }}</small></div><div v-if="operations.invites.length" class="invite-list"><div v-for="invite in operations.invites" :key="invite.id" class="invite-row"><div><strong>{{ invite.channel || t('defaultChannel') }}</strong><small>{{ invite.target }} · {{ formatDate(invite.expiresAt) }}</small></div><div class="invite-row-meta"><Chip :variant="invite.status === 'active' ? 'accent' : 'danger'">{{ inviteStatusLabel(invite.status) }}</Chip><span>{{ invite.useCount }}/{{ invite.maxUses || '∞' }}</span><Button v-if="invite.status === 'active'" variant="ghost" size="sm" :class="dangerSoftClass" @click="revokeInvite(invite)">{{ t('revoke') }}</Button></div></div></div></article>
    </div>
    <div class="operations-grid lower-operations">
      <article class="operation-card diagnostics-card"><header><div><h3>{{ t('diagnostics') }}</h3><p>{{ t('diagnosticsLead') }}</p></div><a class="text-link" href="/api/admin/diagnostics/report">{{ t('downloadReport') }}</a></header><dl class="diagnostic-list"><div><dt>{{ t('version') }}</dt><dd>{{ operations.diagnostics.version || '—' }}</dd></div><div><dt>{{ t('runtime') }}</dt><dd>{{ operations.diagnostics.node || '—' }}</dd></div><div><dt>{{ t('platform') }}</dt><dd>{{ operations.diagnostics.platform || '—' }} / {{ operations.diagnostics.arch || '—' }}</dd></div><div><dt>{{ t('databaseSchema') }}</dt><dd>v{{ operations.diagnostics.schemaVersion || '—' }}</dd></div><div><dt>{{ t('createdSessions') }}</dt><dd>{{ operations.diagnostics.createdSessions }}</dd></div></dl><Button variant="secondary" class="mt-auto" @click="downloadBackup()">{{ t('exportBackup') }}</Button></article>
      <article class="operation-card logs-card"><header><div><h3>{{ t('logViewer') }}</h3><p>{{ t('logViewerLead') }}</p></div><span v-if="!operations.logs.available" class="muted-label">{{ t('logsUnavailable') }}</span></header><div v-if="operations.logs.sessions.length" class="connection-list" role="region" tabindex="0" :aria-label="t('connectionHistory')"><div class="connection-history-heading"><strong>{{ t('connectionHistory') }}</strong><small>{{ t('connectionHistoryLead') }}</small></div><div v-for="record in operations.logs.sessions" :key="record.id" class="connection-row"><div class="connection-person"><strong>{{ record.nickname }}</strong><small>{{ record.target }}</small><small class="connection-route">{{ connectionRoute(record) }}</small></div><div class="connection-detail"><span :class="['connection-status', record.status]">{{ connectionStatusLabel(record.status) }}</span><small>{{ record.connectedAt ? t('connectedAt') : t('connectionAttemptedAt') }}：{{ formatDate(record.connectedAt || record.startedAt) }}</small><small>{{ t('duration') }}：{{ formatAge(record.durationSeconds) }}</small><small v-if="record.disconnectedAt">{{ t('disconnectedAt') }}：{{ formatDate(record.disconnectedAt) }}</small><small v-if="record.reason">{{ t('failureReason') }}：{{ connectionFailureText(record.reason) }}</small><small v-if="record.failureDetail" class="failure-detail">{{ t('failureDetail') }}：{{ record.failureDetail }}</small></div></div></div><div v-if="operations.logs.entries.length" class="log-list" role="region" tabindex="0" :aria-label="t('logViewer')"><div v-for="(entry, index) in operations.logs.entries" :key="`${entry.timestamp}-${index}`" class="log-row"><span :class="['log-level', entry.level.toLowerCase()]">{{ entry.level }}</span><div><strong>{{ entry.message || '—' }}</strong><small>{{ formatDate(entry.timestamp) }}<template v-if="Object.keys(entry.context).length"> · {{ formatContext(entry.context) }}</template></small></div></div></div><div v-if="!operations.logs.sessions.length && !operations.logs.entries.length" class="operation-empty"><Icon name="activity" :size="22" /><span>{{ t('noLogs') }}</span></div></article>
      <article class="operation-card audit-card"><header><div><h3>{{ t('audit') }}</h3><p>{{ t('auditLead') }}</p></div></header><ul class="event-list"><li v-for="event in operations.audit" :key="`${event.event}-${event.createdAt}`"><span><Icon name="check" :size="14" /></span><div><strong>{{ eventName(event.event) }}</strong><small>{{ formatDate(event.createdAt) }}</small></div></li><li v-if="!operations.audit.length" class="empty-event">{{ t('auditEmpty') }}</li></ul></article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { createAdminFormat } from "@/lib/admin-format";
import { useI18n } from "@/i18n/use-i18n";
import { useAdminOperationsStore } from "@/stores/adminOperations";
import { useAdminOverviewStore } from "@/stores/adminOverview";
import { useAdminSessionStore } from "@/stores/adminSession";

const { submitting } = storeToRefs(useAdminSessionStore());
const operationsStore = useAdminOperationsStore();
const { operations, operationsLoading, terminatingSession, inviteForm, createdInvite } = storeToRefs(operationsStore);
const { loadOperations, terminateSession, createInvite, revokeInvite, copyInviteLink } = operationsStore;
const { downloadBackup } = useAdminOverviewStore();
// The page loads its own data whenever it is entered.
onMounted(loadOperations);

const { language, t } = useI18n();
const { formatDate, formatAge, connectionStatusLabel, connectionRoute, sessionStateLabel, inviteStatusLabel, formatContext, eventName, connectionFailureText } = createAdminFormat(language, t);
const dangerSoftClass = "h-7 bg-danger-soft px-2 text-[10px] text-[var(--color-danger)] hover:bg-danger-soft";
// The invite card sits in a fixed-height row, so its controls are 34 px tall.
const inviteInputClass = "h-[34px] px-2.5 py-[7px]";
</script>

<style scoped>
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.page-heading h2 { margin: 0; font-size: 25px; font-weight: 700; }
.page-heading p { margin: 7px 0 0; color: var(--ws-fg-muted); font-size: 12px; }
.event-list { display: grid; gap: 10px; margin: 18px 0 0; padding: 0; list-style: none; }
.event-list li { display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--ws-surface-0); border-radius: 9px; }
.event-list li>span { display: grid; place-items: center; width: 27px; height: 27px; color: color-mix(in srgb, var(--ws-accent) 85%, var(--ws-fg)); background: var(--ws-accent-soft); border-radius: 8px; }
.event-list strong, .event-list small { display: block; }
.event-list strong { font-size: 11px; }
.event-list small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 9px; }
.event-list .empty-event { display: block; color: var(--ws-fg-muted); text-align: center; }
.operations-grid { display: grid; grid-template-columns: minmax(0,1.12fr) minmax(340px,.88fr); gap: 18px; }
.operation-card { min-width: 0; padding: 22px; background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 14px; }
.operation-card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; }
.operation-card h3 { margin: 0; font-size: 15px; font-weight: 700; }
.operation-card header p { margin: 5px 0 0; color: var(--ws-fg-muted); font-size: 10px; line-height: 1.5; }
.operation-card header>strong { color: color-mix(in srgb, var(--ws-accent) 85%, var(--ws-fg)); font-size: 22px; }
.table-wrap { margin: 18px -22px -22px; overflow: auto; border-top: 1px solid var(--ws-line); }
.table-wrap table { width: 100%; min-width: 600px; border-collapse: collapse; text-align: left; }
.table-wrap th, .table-wrap td { padding: 12px 14px; border-bottom: 1px solid var(--ws-line); font-size: 11px; white-space: nowrap; }
.table-wrap th { color: var(--ws-fg-muted); font-size: 10px; font-weight: 700; }
.table-wrap td strong, .table-wrap td small { display: block; }
.table-wrap td small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 9px; }
.operation-empty { display: grid; place-items: center; gap: 8px; min-height: 130px; color: var(--ws-fg-muted); text-align: center; font-size: 11px; }
.operation-empty .ui-icon { color: var(--ws-accent); }
.invite-form { display: grid; gap: 14px; margin-top: 18px; }
.invite-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.field-help { margin-top: -8px; color: var(--ws-fg-muted); font-size: 10px; }
.generated-invite { display: grid; gap: 8px; margin-top: 17px; padding: 12px; color: var(--ws-accent); background: var(--ws-accent-soft); border-radius: 9px; }
.generated-invite strong { font-size: 11px; }
.generated-invite small { color: var(--ws-fg-muted); font-size: 9px; line-height: 1.45; }
.generated-link { display: flex; gap: 6px; }
.invite-list { display: grid; gap: 9px; margin-top: 18px; padding-top: 15px; border-top: 1px solid var(--ws-line); }
.invite-row { display: flex; align-items: center; justify-content: space-between; gap: 9px; padding: 10px; background: var(--ws-surface-0); border-radius: 9px; }
.invite-row>div:first-child { min-width: 0; }
.invite-row strong, .invite-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.invite-row strong { font-size: 11px; }
.invite-row small { max-width: 260px; margin-top: 4px; color: var(--ws-fg-muted); font-size: 9px; }
.invite-row-meta { display: flex; align-items: center; gap: 7px; flex: none; color: var(--ws-fg-muted); font-size: 9px; }
.lower-operations { margin-top: 18px; }
.text-link { color: color-mix(in srgb, var(--ws-accent) 85%, var(--ws-fg)); font-size: 10px; font-weight: 700; text-decoration: none; white-space: nowrap; }
.diagnostic-list { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin: 18px 0; }
.diagnostic-list div { padding: 10px; background: var(--ws-surface-0); border-radius: 8px; }
.diagnostic-list dt { color: var(--ws-fg-muted); font-size: 9px; }
.diagnostic-list dd { margin: 4px 0 0; overflow: hidden; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.logs-card { display: flex; min-height: 250px; flex-direction: column; }
.audit-card { min-height: 250px; }
.muted-label { color: var(--ws-fg-muted); font-size: 9px; }
.log-list { display: grid; gap: 7px; max-height: 280px; margin-top: 16px; overflow: auto; }
.log-row { display: flex; align-items: flex-start; gap: 8px; padding: 8px; background: var(--ws-surface-0); border-radius: 7px; }
.log-row>div { min-width: 0; }
.log-row strong, .log-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-row strong { font-size: 10px; }
.log-row small { margin-top: 4px; color: var(--ws-fg-muted); font-size: 8px; }
.log-level { flex: none; padding: 3px 5px; border-radius: 4px; color: var(--ws-accent); background: var(--ws-accent-soft); font-size: 8px; font-weight: 800; }
.log-level.warn { color: var(--ws-warning); background: var(--ws-warning-soft); }
.log-level.error, .log-level.fatal { color: var(--ws-danger); background: var(--ws-danger-soft); }
@media(max-width:850px){.operations-grid{grid-template-columns:1fr}.operation-wide{overflow:hidden}}
@media (max-width: 520px) {
  .operation-card { padding: 18px; }
  .table-wrap { margin-left: -18px; margin-right: -18px; margin-bottom: -18px; }
  /* The age and member count are not worth the width they take from the action at this size
     (bug F31: the table's 600px min-width put the Terminate button off screen). Drop the
     min-width and the two columns, and let the nickname cell wrap instead of forcing it. */
  .table-wrap table { min-width: 0; }
  .table-wrap th:nth-child(3), .table-wrap td:nth-child(3), .table-wrap th:nth-child(4), .table-wrap td:nth-child(4) { display: none; }
  .table-wrap td:first-child { white-space: normal; overflow-wrap: anywhere; }
  .invite-form-grid, .diagnostic-list { grid-template-columns: 1fr; }
  .generated-link { display: grid; }
  .invite-row { align-items: flex-start; flex-direction: column; }
  .invite-row-meta { width: 100%; justify-content: flex-end; }
  .lower-operations { margin-top: 14px; }
}
@media (max-width: 520px) {
  .page-heading { gap: 15px; }
}
.operations-page .page-heading{flex:0 0 auto;margin-bottom:16px}
.operations-page .system-notice{flex:0 0 auto;margin-bottom:12px}
.operations-page .operations-grid{min-width:0;min-height:0}
.operations-primary{flex:0 0 auto;grid-template-columns:minmax(0,1.2fr) minmax(360px,.8fr)}
.operations-primary>.operation-card{min-height:0;overflow:hidden}
.operations-primary .table-wrap{max-height:190px}
.operations-primary .invite-list{max-height:132px;overflow-y:auto}
.lower-operations{flex:1 1 0;grid-template-columns:minmax(210px,.9fr) minmax(0,1.1fr) minmax(210px,.9fr);margin-top:14px}
.lower-operations>.operation-card{min-height:0}
.diagnostics-card,.logs-card,.audit-card{overflow:hidden}
.diagnostics-card{display:flex;flex-direction:column;overflow-y:auto}
.logs-card,.audit-card{display:flex;flex-direction:column}
.logs-card .log-list,.audit-card .event-list{flex:1 1 0;min-height:0;max-height:none;overflow-y:auto}
@media(max-width:850px){
  .page-heading{flex-wrap:wrap}
  .operations-page .lower-operations{flex:none}
}
.operations-primary{flex:0 0 250px}
.operations-primary>.operation-card{overflow-y:auto}
.operations-primary>.operation-card{padding:14px 16px}
.operations-primary .operation-card header p{line-height:1.3}
.operations-primary .invite-form{gap:6px;margin-top:8px}
.operations-primary .field-help{margin-top:-4px}
@media(max-width:850px){
  .operations-page .operations-primary,.operations-page .lower-operations{grid-template-columns:1fr;min-height:0;overflow-y:auto;align-content:start}
  .operations-page .operations-primary{grid-auto-rows:240px}
  .operations-page .lower-operations{grid-auto-rows:190px}
  .operations-page .lower-operations{flex:1 1 0}
}
@media(max-width:850px){
  .operations-page .operations-primary,.operations-page .lower-operations{height:auto;min-height:0;overflow:visible;grid-auto-rows:auto;flex:none}
  .operations-page .operation-card{height:auto;min-height:0;overflow:visible}
  .operations-primary .table-wrap{max-height:none;overflow-x:auto;overflow-y:visible}
  .operations-primary .invite-list{max-height:none;overflow:visible}
  .logs-card .log-list,.audit-card .event-list{max-height:none;overflow:visible;flex:none}
  .logs-card .log-list{width:100%;min-width:0}
  .logs-card .log-row{min-width:0;max-width:100%;overflow:hidden}
  .logs-card .log-row>div{width:0;max-width:100%;flex:1 1 auto;min-width:0;overflow:hidden}
  .logs-card .log-row strong,.logs-card .log-row small{overflow-wrap:anywhere;white-space:normal;word-break:break-word}
}
/* Long log messages should wrap on every screen size instead of widening the
   log card or introducing page-level horizontal scrolling. */
.logs-card .log-row{min-width:0}
.logs-card .log-row strong,.logs-card .log-row small{overflow-wrap:anywhere;white-space:normal;word-break:break-word}
.connection-list{display:grid;gap:7px;max-height:180px;margin-top:12px;overflow-y:auto}
.connection-history-heading{display:grid;gap:3px;padding:0 0 6px;border-bottom:1px solid var(--ws-line)}
.connection-history-heading strong{font-size:10px}
.connection-history-heading small{color:var(--ws-fg-muted);font-size:8px}
.connection-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:8px;background:var(--ws-surface-0);border-radius:7px}
.connection-person,.connection-detail{min-width:0}
.connection-person{flex:1 1 auto}
.connection-person strong,.connection-person small,.connection-detail small{display:block;overflow-wrap:anywhere;word-break:break-word}
.connection-person strong{font-size:10px}
.connection-person small{margin-top:3px;color:var(--ws-fg-muted);font-size:8px}
.connection-person .connection-route{color:var(--ws-accent);font-weight:600}
.connection-detail{display:grid;flex:0 1 58%;justify-items:end;gap:2px;text-align:right}
.connection-detail small{color:var(--ws-fg-muted);font-size:8px}
.connection-status{display:inline-flex;padding:3px 6px;border-radius:999px;color:var(--ws-accent);background:var(--ws-accent-soft);font-size:8px;font-weight:800}
.connection-status.disconnected{color:var(--ws-fg-muted);background:var(--ws-surface-2)}
.connection-status.failed{color:var(--ws-danger);background:var(--ws-danger-soft)}
.connection-status.connecting{color:var(--ws-warning);background:var(--ws-warning-soft)}
@media(max-width:520px){
  .connection-row{display:grid;gap:7px}
  .connection-detail{justify-items:start;text-align:left}
}
</style>
