<template>
  <section :class="adminPageWide">
    <div class="mb-4 flex shrink-0 items-start justify-between max-narrow:gap-3.75 max-desktop:flex-wrap">
      <div><h2 class="text-2xl font-bold">{{ t('operations') }}</h2><p class="mt-1.75 text-xs text-fg-muted">{{ t('operationsLead') }}</p></div>
      <Button variant="secondary" :loading="operationsLoading" @click="loadOperations()"><Icon v-if="!operationsLoading" name="refresh" :size="17" />{{ t('refresh') }}</Button>
    </div>
    <Banner class="mb-3 shrink-0">{{ t('updateNotice', { version: operations.diagnostics.version || '—' }) }}</Banner>
    <div class="grid min-h-0 min-w-0 shrink-0 basis-62.5 grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)] gap-4.5 max-desktop:basis-auto max-desktop:grid-cols-1">
      <Card as="article" padding="dense" class="min-h-0 overflow-y-auto max-desktop:overflow-visible">
        <header :class="cardHeader"><div><h3 :class="cardTitle">{{ t('sessions') }}</h3><p :class="cardLead">{{ t('sessionsLead') }}</p></div><strong class="text-xl text-accent">{{ operations.sessions.length }}</strong></header>
        <div v-if="operations.sessions.length" class="-mx-5.5 -mb-5.5 mt-4.5 max-h-47.5 overflow-auto border-t border-line max-narrow:-mx-4.5 max-narrow:-mb-4.5 max-desktop:max-h-none">
          <table class="w-full min-w-150 border-collapse text-left max-narrow:min-w-0">
            <thead><tr>
              <th :class="th">{{ t('sessionNickname') }}</th>
              <th :class="th">{{ t('sessionState') }}</th>
              <th :class="[th, 'max-narrow:hidden']">{{ t('age') }}</th>
              <th :class="[th, 'max-narrow:hidden']">{{ t('memberCount') }}</th>
              <th :class="th"><span class="sr-only">{{ t('sessionActions') }}</span></th>
            </tr></thead>
            <tbody><tr v-for="session in operations.sessions" :key="session.id">
              <td :class="[td, 'max-narrow:wrap-anywhere max-narrow:whitespace-normal']"><strong class="block">{{ session.nickname }}</strong><small :class="tdSmall">{{ session.target }}</small></td>
              <td :class="td"><Chip variant="accent">{{ sessionStateLabel(session.state) }}</Chip></td>
              <td :class="[td, 'max-narrow:hidden']">{{ formatAge(session.ageSeconds) }}</td>
              <td :class="[td, 'max-narrow:hidden']">{{ session.memberCount }}</td>
              <td :class="td"><Button variant="dangerSoft" size="xs" :disabled="terminatingSession === session.id" @click="terminateSession(session)">{{ terminatingSession === session.id ? t('terminating') : t('endSession') }}</Button></td>
            </tr></tbody>
          </table>
        </div>
        <div v-else :class="emptyState"><Icon name="users" :size="22" class="text-accent" /><span>{{ t('sessionEmpty') }}</span></div>
      </Card>
      <Card as="article" padding="dense" class="min-h-0 overflow-y-auto max-desktop:overflow-visible">
        <header :class="cardHeader"><div><h3 :class="cardTitle">{{ t('invites') }}</h3><p :class="cardLead">{{ t('invitesLead') }}</p></div></header>
        <form class="mt-2 grid gap-1.5" @submit.prevent="createInvite()">
          <Field :label="t('inviteChannel')" class="gap-1"><Input v-model.trim="inviteForm.channel" :input-class="inviteInputClass" maxlength="100" :placeholder="t('inviteChannelPlaceholder')" /></Field>
          <div class="grid grid-cols-2 gap-2.5 max-narrow:grid-cols-1">
            <Field :label="t('expiresIn')" class="gap-1"><Input v-model.number="inviteForm.expiresInHours" :input-class="inviteInputClass" type="number" min="1" max="720" /></Field>
            <Field :label="t('maxUses')" class="gap-1"><Input v-model.number="inviteForm.maxUses" :input-class="inviteInputClass" type="number" min="0" max="10000" /></Field>
          </div>
          <small class="-mt-1 text-2xs text-fg-muted">{{ t('unlimitedUses') }}</small>
          <Button type="submit" size="sm" :loading="submitting">{{ t('createInvite') }}</Button>
        </form>
        <div v-if="createdInvite" class="mt-4.25 grid gap-2 rounded-md bg-accent-soft p-3 text-accent">
          <strong class="text-caption">{{ t('inviteCreated') }}</strong>
          <div class="flex gap-1.5 max-narrow:grid"><Input :model-value="createdInvite.link" readonly :aria-label="t('inviteCreated')" input-class="h-9 px-2 text-2xs" /><Button variant="secondary" size="sm" @click="copyInviteLink()">{{ t('copyLink') }}</Button></div>
          <small class="text-2xs leading-snug text-fg-muted">{{ t('inviteSecurity') }}</small>
        </div>
        <div v-if="operations.invites.length" class="mt-4.5 grid max-h-33 gap-2.25 overflow-y-auto border-t border-line pt-3.75 max-desktop:max-h-none max-desktop:overflow-visible">
          <!-- `invite-row` is the e2e locator -->
          <div v-for="invite in operations.invites" :key="invite.id" class="invite-row flex items-center justify-between gap-2.25 rounded-md bg-surface-0 p-2.5 max-narrow:flex-col max-narrow:items-start">
            <div class="min-w-0"><strong class="block truncate text-caption">{{ invite.channel || t('defaultChannel') }}</strong><small class="mt-1 block max-w-65 truncate text-2xs text-fg-muted">{{ invite.target }} · {{ formatDate(invite.expiresAt) }}</small></div>
            <div class="flex flex-none items-center gap-1.75 text-2xs text-fg-muted max-narrow:w-full max-narrow:justify-end">
              <Chip :variant="invite.status === 'active' ? 'accent' : 'danger'">{{ inviteStatusLabel(invite.status) }}</Chip><span>{{ invite.useCount }}/{{ invite.maxUses || '∞' }}</span>
              <Button v-if="invite.status === 'active'" variant="dangerSoft" size="xs" @click="revokeInvite(invite)">{{ t('revoke') }}</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
    <div class="mt-3.5 grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(210px,.9fr)_minmax(0,1.1fr)_minmax(210px,.9fr)] gap-4.5 max-desktop:flex-none max-desktop:grid-cols-1">
      <Card as="article" padding="lg" body-class="flex min-h-0 flex-col" class="min-h-0 overflow-y-auto max-desktop:overflow-visible">
        <header :class="cardHeader"><div><h3 :class="cardTitle">{{ t('diagnostics') }}</h3><p :class="cardLead">{{ t('diagnosticsLead') }}</p></div><a class="text-2xs font-bold whitespace-nowrap text-accent no-underline" href="/api/admin/diagnostics/report">{{ t('downloadReport') }}</a></header>
        <dl class="my-4.5 grid grid-cols-2 gap-2.25 max-narrow:grid-cols-1">
          <div v-for="fact in diagnosticFacts" :key="fact.label" class="rounded-md bg-surface-0 p-2.5"><dt class="text-2xs text-fg-muted">{{ fact.label }}</dt><dd class="mt-1 truncate text-caption font-bold">{{ fact.value }}</dd></div>
        </dl>
        <Button variant="secondary" class="mt-auto" @click="downloadBackup()">{{ t('exportBackup') }}</Button>
      </Card>
      <Card as="article" padding="lg" body-class="flex min-h-0 flex-col" class="min-h-0 overflow-hidden max-desktop:overflow-visible">
        <header :class="cardHeader"><div><h3 :class="cardTitle">{{ t('logViewer') }}</h3><p :class="cardLead">{{ t('logViewerLead') }}</p></div><span v-if="!operations.logs.available" class="text-2xs text-fg-muted">{{ t('logsUnavailable') }}</span></header>
        <div v-if="operations.logs.sessions.length" class="mt-3 grid max-h-45 gap-1.75 overflow-y-auto" role="region" tabindex="0" :aria-label="t('connectionHistory')">
          <div class="grid gap-0.75 border-b border-line pb-1.5"><strong class="text-2xs">{{ t('connectionHistory') }}</strong><small class="text-2xs text-fg-muted">{{ t('connectionHistoryLead') }}</small></div>
          <div v-for="record in operations.logs.sessions" :key="record.id" class="flex items-start justify-between gap-2.5 rounded-md bg-surface-0 p-2 max-narrow:grid max-narrow:gap-1.75">
            <div class="min-w-0 flex-auto"><strong class="block text-2xs wrap-anywhere">{{ record.nickname }}</strong><small :class="[connSmall, 'mt-0.75 text-fg-muted']">{{ record.target }}</small><small :class="[connSmall, 'mt-0.75 font-semibold text-accent']">{{ connectionRoute(record) }}</small></div>
            <div class="grid min-w-0 shrink basis-7/12 justify-items-end gap-0.5 text-right max-narrow:justify-items-start max-narrow:text-left">
              <span :class="['inline-flex rounded-full px-1.5 py-0.75 text-2xs font-extrabold', connectionStatusClass[record.status] ?? 'bg-accent-soft text-accent']">{{ connectionStatusLabel(record.status) }}</span>
              <small :class="[connSmall, 'text-fg-muted']">{{ record.connectedAt ? t('connectedAt') : t('connectionAttemptedAt') }}: {{ formatDate(record.connectedAt || record.startedAt) }}</small>
              <small :class="[connSmall, 'text-fg-muted']">{{ t('duration') }}: {{ formatAge(record.durationSeconds) }}</small>
              <small v-if="record.disconnectedAt" :class="[connSmall, 'text-fg-muted']">{{ t('disconnectedAt') }}: {{ formatDate(record.disconnectedAt) }}</small>
              <small v-if="record.reason" :class="[connSmall, 'text-fg-muted']">{{ t('failureReason') }}: {{ connectionFailureText(record.reason) }}</small>
              <small v-if="record.failureDetail" :class="[connSmall, 'text-fg-muted']">{{ t('failureDetail') }}: {{ record.failureDetail }}</small>
            </div>
          </div>
        </div>
        <div v-if="operations.logs.entries.length" class="mt-4 grid min-h-0 w-full min-w-0 flex-1 basis-0 gap-1.75 overflow-y-auto max-desktop:flex-none max-desktop:overflow-visible" role="region" tabindex="0" :aria-label="t('logViewer')">
          <div v-for="(entry, index) in operations.logs.entries" :key="`${entry.timestamp}-${index}`" class="flex max-w-full min-w-0 items-start gap-2 rounded-md bg-surface-0 p-2 max-desktop:overflow-hidden">
            <span :class="['flex-none rounded-sm px-1.25 py-0.75 text-2xs font-extrabold', logLevelClass(entry.level)]">{{ entry.level }}</span>
            <div class="min-w-0 max-desktop:w-0 max-desktop:max-w-full max-desktop:flex-auto max-desktop:overflow-hidden"><strong class="block text-2xs wrap-anywhere">{{ entry.message || '—' }}</strong><small class="mt-1 block text-2xs wrap-anywhere text-fg-muted">{{ formatDate(entry.timestamp) }}<template v-if="Object.keys(entry.context).length"> · {{ formatContext(entry.context) }}</template></small></div>
          </div>
        </div>
        <div v-if="!operations.logs.sessions.length && !operations.logs.entries.length" :class="emptyState"><Icon name="activity" :size="22" class="text-accent" /><span>{{ t('noLogs') }}</span></div>
      </Card>
      <Card as="article" padding="lg" body-class="flex min-h-0 flex-col" class="min-h-0 overflow-hidden max-desktop:overflow-visible">
        <header :class="cardHeader"><div><h3 :class="cardTitle">{{ t('audit') }}</h3><p :class="cardLead">{{ t('auditLead') }}</p></div></header>
        <ul class="mt-4.5 grid min-h-0 flex-1 basis-0 gap-2.5 overflow-y-auto max-desktop:flex-none max-desktop:overflow-visible">
          <li v-for="event in operations.audit" :key="`${event.event}-${event.createdAt}`" class="flex items-center gap-2.5 rounded-md bg-surface-0 p-2.5"><span class="grid size-6.75 place-items-center rounded-md bg-accent-soft text-accent"><Icon name="check" :size="14" /></span><div><strong class="block text-caption">{{ eventName(event.event) }}</strong><small class="mt-0.75 block text-2xs text-fg-muted">{{ formatDate(event.createdAt) }}</small></div></li>
          <li v-if="!operations.audit.length" class="rounded-md bg-surface-0 p-2.5 text-center text-fg-muted">{{ t('auditEmpty') }}</li>
        </ul>
      </Card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { adminPageWide } from "./adminPage";
import { VERSION_PREFIX } from "@/shared/lib/brand";
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Banner } from "@/shared/ui/banner";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { createAdminFormat } from "./adminFormat";
import { useI18n } from "@/shared/i18n/useI18n";
import { useAdminOperationsStore } from "./adminOperations";
import { useAdminOverviewStore } from "./adminOverview";
import { useAdminSessionStore } from "./adminSession";

const { submitting } = storeToRefs(useAdminSessionStore());
const operationsStore = useAdminOperationsStore();
const { operations, operationsLoading, terminatingSession, inviteForm, createdInvite } = storeToRefs(operationsStore);
const { loadOperations, terminateSession, createInvite, revokeInvite, copyInviteLink } = operationsStore;
const { downloadBackup } = useAdminOverviewStore();
// The page loads its own data whenever it is entered.
onMounted(loadOperations);

const { language, t } = useI18n();
const { formatDate, formatAge, connectionStatusLabel, connectionRoute, sessionStateLabel, inviteStatusLabel, formatContext, eventName, connectionFailureText } = createAdminFormat(language, t);
// The invite card sits in a fixed-height row, so its controls are 34 px tall.
const inviteInputClass = "h-8.5 px-2.5 py-1.75";

const cardHeader = "flex items-start justify-between gap-3.75";
const cardTitle = "text-md font-bold";
const cardLead = "mt-1.25 text-2xs leading-tight text-fg-muted";
const th = "border-b border-line px-3.5 py-3 text-2xs font-bold whitespace-nowrap text-fg-muted";
const td = "border-b border-line px-3.5 py-3 text-caption whitespace-nowrap";
const tdSmall = "mt-0.75 block text-2xs text-fg-muted";
const emptyState = "grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted";
const connSmall = "block text-2xs wrap-anywhere";
const connectionStatusClass: Record<string, string> = {
  disconnected: "bg-surface-2 text-fg-muted",
  failed: "bg-danger-soft text-danger",
  connecting: "bg-warning-soft text-warning",
};
function logLevelClass(level: string) {
  const l = level.toLowerCase();
  if (l === "warn") return "bg-warning-soft text-warning";
  if (l === "error" || l === "fatal") return "bg-danger-soft text-danger";
  return "bg-accent-soft text-accent";
}
const diagnosticFacts = computed(() => {
  const d = operations.value.diagnostics;
  return [
    { label: t("version"), value: d.version || "—" },
    { label: t("runtime"), value: d.node || "—" },
    { label: t("platform"), value: `${d.platform || "—"} / ${d.arch || "—"}` },
    { label: t("databaseSchema"), value: `${VERSION_PREFIX}${d.schemaVersion || "—"}` },
    { label: t("createdSessions"), value: d.createdSessions },
  ];
});
</script>
