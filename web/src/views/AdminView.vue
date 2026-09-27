<template>
  <div class="admin-root">
    <div v-if="loading" class="center-card compact"><span class="spinner"></span><p>{{ t('loading') }}</p></div>

    <main v-else-if="screen === 'change-password'" class="login-page">
      <section class="login-card">
        <div class="admin-brand centered"><span><Icon name="waveform" :size="24" /></span><div><strong>WebSpeak</strong><small>{{ t('adminConsoleTitle') }}</small></div></div>
        <header><h1>{{ t('changePasswordTitle') }}</h1><p>{{ t('changePasswordLead') }}</p></header>
        <form @submit.prevent="changePassword">
          <Banner v-if="errorMessage" variant="danger" class="text-left">{{ errorMessage }}</Banner>
          <Field :label="t('newPassword')" class="text-left"><Input v-model="newPassword" type="password" autocomplete="new-password" maxlength="1024" autofocus :placeholder="t('passwordPlaceholder')" /></Field>
          <Field :label="t('confirmPassword')" class="text-left"><Input v-model="confirmNewPassword" type="password" autocomplete="new-password" maxlength="1024" /></Field>
          <div class="strength"><i :style="{ width: `${passwordStrength}%` }"></i></div>
          <Button type="submit" class="w-full" :loading="submitting">{{ t('savePassword') }}</Button>
        </form>
        <p class="security-note">{{ t('defaultCredentialNotice') }}</p><LanguageSwitcher v-model="language" class="language-link" :menu-label="t('languageMenu')" @change="persistLanguage" />
      </section>
    </main>

    <main v-else-if="screen === 'login'" class="login-page">
      <section class="login-card">
        <div class="admin-brand centered"><span><Icon name="waveform" :size="24" /></span><div><strong>WebSpeak</strong><small>{{ t('adminConsoleTitle') }}</small></div></div>
        <header><h1>{{ t('welcomeAdmin') }}</h1><p>{{ t('loginLead') }}</p></header>
        <form @submit.prevent="login">
          <Banner v-if="errorMessage" variant="danger" class="text-left">{{ errorMessage }}</Banner>
          <Field :label="t('adminUsername')" class="text-left"><Input v-model="loginUsername" autocomplete="username" autofocus /></Field>
          <Field :label="t('adminPassword')" class="text-left"><Input v-model="loginPassword" type="password" autocomplete="current-password" /></Field>
          <Button type="submit" class="w-full" :loading="submitting">{{ t('login') }}</Button>
        </form>
        <div class="login-actions"><RouterLink to="/" class="home-link"><Icon name="home" :size="15" />{{ t('backHome') }}</RouterLink><LanguageSwitcher v-model="language" class="language-link" :menu-label="t('languageMenu')" @change="persistLanguage" /></div>
      </section>
    </main>

    <div v-else class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-brand"><span><Icon name="waveform" :size="22" /></span><div><strong>WebSpeak</strong><small>{{ t('adminConsoleTitle') }}</small></div></div>
        <nav><RouterLink to="/admin" exact-active-class="active"><Icon name="activity" :size="18" />{{ t('overview') }}</RouterLink><RouterLink to="/admin/server" active-class="active"><Icon name="server" :size="18" />{{ t('server') }}</RouterLink><RouterLink to="/admin/operations" active-class="active"><Icon name="users" :size="18" />{{ t('operations') }}</RouterLink></nav>
        <div class="sidebar-bottom">
          <Button as="a" variant="ghost" :class="sidebarActionClass + ' max-[850px]:hidden'" href="/" target="_blank"><Icon name="share" :size="16" />{{ t('openGuest') }}</Button>
          <Button variant="ghost" :class="sidebarActionClass" :aria-label="t('logout')" @click="logout"><Icon name="door" :size="16" /><span class="max-[850px]:sr-only">{{ t('logout') }}</span></Button>
        </div>
      </aside>

      <main class="admin-main">
        <header class="admin-topbar"><div><small>{{ t('adminConsoleTitle') }}</small><h1>{{ currentPageTitle }}</h1></div><div><Chip variant="success" dot><span class="max-[520px]:sr-only">{{ t('gatewayRunning') }}</span></Chip><Button variant="outline" size="sm" class="gap-1.5 border-line bg-accent-soft text-[11px] font-bold text-accent hover:bg-accent-soft" :title="themeLabel" :aria-label="themeLabel" @click="cycleTheme"><Icon :name="themeIcon" :size="17" /><span class="max-[520px]:hidden">{{ themeLabel }}</span></Button><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" @change="persistLanguage" /></div></header>

        <Banner v-if="errorMessage" variant="danger" class="page-alert w-auto">{{ errorMessage }}</Banner>
        <section v-if="route.path === '/admin/server'" class="page-content server-page">
          <div class="page-heading"><div><h2>{{ t('serverSettings') }}</h2><p>{{ t('serverSettingsLead') }}</p></div><Button :loading="submitting" @click="saveServerSettings">{{ submitting ? t('saving') : t('saveChanges') }}</Button></div>
          <div class="settings-grid">
            <article class="settings-card">
              <h3>{{ t('teamSpeakTarget') }}</h3>
              <div class="target-fields">
                <Field :label="t('serverAddress')"><Input v-model.trim="serverForm.address" :placeholder="t('serverPlaceholder')" /></Field>
                <Field :label="t('serverPort')"><Input v-model.trim="serverForm.port" inputmode="numeric" type="text" maxlength="5" :placeholder="t('serverPortPlaceholder')" /></Field>
              </div>
              <div class="password-row">
                <Field :label="t('serverPassword')"><Input v-model="serverForm.serverPassword" type="password" autocomplete="off" :disabled="serverForm.passwordAction !== 'replace'" :placeholder="serverForm.hasPassword ? t('passwordConfigured') : t('passwordOptionalHint')" /></Field>
                <Segmented v-model="serverForm.passwordAction" :aria-label="t('serverPassword')" class="h-10 items-center self-end justify-self-start">
                  <Segment value="replace">{{ t('change') }}</Segment>
                  <Segment v-if="serverForm.hasPassword" value="remove">{{ t('remove') }}</Segment>
                </Segmented>
              </div>
              <Button variant="secondary" :loading="testing" @click="testServerConnection"><Icon v-if="!testing" name="activity" :size="17" />{{ testing ? t('testing') : t('testConnection') }}</Button>
              <Banner v-if="testResult" :variant="testResult.ok ? 'info' : 'danger'" :icon="testResult.ok ? 'check' : 'close'" :title="testResultTitle">{{ testResultText }}</Banner>
            </article>
            <article class="settings-card">
              <h3>{{ t('accessAndIdentity') }}</h3>
              <div class="grid gap-2">
                <Label id="access-mode-label">{{ t('accessMode') }}</Label>
                <RadioGroup v-model="serverForm.accessMode" aria-labelledby="access-mode-label" class="gap-2.5">
                  <Radio value="fixed" :class="choiceClass">
                    <span class="block text-xs font-bold">{{ t('fixedMode') }}</span>
                    <span class="mt-1 block text-[10px] leading-[1.45] text-fg-muted">{{ t('fixedModeLead') }}</span>
                  </Radio>
                  <Radio value="open" :class="choiceClass">
                    <span class="block text-xs font-bold">{{ t('openMode') }}</span>
                    <span class="mt-1 block text-[10px] leading-[1.45] text-fg-muted">{{ t('openModeLead') }}</span>
                  </Radio>
                </RadioGroup>
              </div>
              <Field :label="t('siteName')"><Input v-model.trim="serverForm.siteName" maxlength="80" /></Field>
              <div class="welcome-editor">
                <div class="welcome-editor-heading">
                  <Field :label="t('welcomeLanguage')">
                    <Select v-model="welcomeLanguage"><option v-for="option in welcomeLanguageOptions" :key="option.value" :value="option.value">{{ option.label }}</option></Select>
                  </Field>
                  <small>{{ t('welcomeLanguageHint') }}</small>
                </div>
                <Field id="welcome-text" :label="`${t('welcomeText')} · ${selectedWelcomeLanguageLabel}`" :hint="t('welcomeFallbackHint')">
                  <Textarea v-model="selectedWelcomeText" maxlength="500" :rows="4" :placeholder="selectedWelcomeDefault" />
                </Field>
              </div>
            </article>
            <article class="settings-card advanced-card">
              <div><h3>{{ t('advancedSettings') }}</h3><p class="card-help">{{ t('advancedSettingsLead') }}</p></div>
              <Checkbox v-model="serverForm.webRtcEnabled" :class="choiceClass" @update:model-value="handleWebRtcToggle">
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
              <Button variant="secondary" size="sm" class="relay-add" @click="addRelayNode">{{ t('relayAdd') }}</Button>
              <small class="field-help">{{ t('relayManagedHint') }}</small>
            </article>
          </div>
          <article class="readonly-card"><h3>{{ t('runtimeFacts') }}</h3><dl><div><dt>{{ t('lastTest') }}</dt><dd>{{ formatDate(serverForm.lastTestAt) }}</dd></div><div><dt>{{ t('latency') }}</dt><dd>{{ serverForm.lastTestLatencyMs == null ? '—' : `${serverForm.lastTestLatencyMs} ms` }}</dd></div><div><dt>{{ t('internalPort') }}</dt><dd>3040</dd></div></dl></article>
        </section>

        <section v-else-if="route.path === '/admin/operations'" class="page-content operations-page">
          <div class="page-heading"><div><h2>{{ t('operations') }}</h2><p>{{ t('operationsLead') }}</p></div><Button variant="secondary" :loading="operationsLoading" @click="loadOperations"><Icon v-if="!operationsLoading" name="refresh" :size="17" />{{ t('refresh') }}</Button></div>
          <Banner class="system-notice py-2.5 text-xs leading-[normal]">{{ t('updateNotice', { version: operations.diagnostics.version || '—' }) }}</Banner>
          <div class="operations-grid operations-primary">
            <article class="operation-card operation-wide"><header><div><h3>{{ t('sessions') }}</h3><p>{{ t('sessionsLead') }}</p></div><strong>{{ operations.sessions.length }}</strong></header><div v-if="operations.sessions.length" class="table-wrap"><table><thead><tr><th>{{ t('sessionNickname') }}</th><th>{{ t('sessionState') }}</th><th>{{ t('age') }}</th><th>{{ t('memberCount') }}</th><th><span class="sr-only">{{ t('sessionActions') }}</span></th></tr></thead><tbody><tr v-for="session in operations.sessions" :key="session.id"><td><strong>{{ session.nickname }}</strong><small>{{ session.target }}</small></td><td><Chip variant="accent">{{ sessionStateLabel(session.state) }}</Chip></td><td>{{ formatAge(session.ageSeconds) }}</td><td>{{ session.memberCount }}</td><td><Button variant="ghost" size="sm" :class="dangerSoftClass" :disabled="terminatingSession === session.id" @click="terminateSession(session)">{{ terminatingSession === session.id ? t('terminating') : t('endSession') }}</Button></td></tr></tbody></table></div><div v-else class="operation-empty"><Icon name="users" :size="22" /><span>{{ t('sessionEmpty') }}</span></div></article>
            <article class="operation-card"><header><div><h3>{{ t('invites') }}</h3><p>{{ t('invitesLead') }}</p></div></header><form class="invite-form" @submit.prevent="createInvite">
                <Field :label="t('inviteChannel')" class="gap-1"><Input v-model.trim="inviteForm.channel" :input-class="inviteInputClass" maxlength="100" :placeholder="t('inviteChannelPlaceholder')" /></Field>
                <div class="invite-form-grid">
                  <Field :label="t('expiresIn')" class="gap-1"><Input v-model.number="inviteForm.expiresInHours" :input-class="inviteInputClass" type="number" min="1" max="720" /></Field>
                  <Field :label="t('maxUses')" class="gap-1"><Input v-model.number="inviteForm.maxUses" :input-class="inviteInputClass" type="number" min="0" max="10000" /></Field>
                </div>
                <small class="field-help">{{ t('unlimitedUses') }}</small>
                <Button type="submit" size="sm" :loading="submitting">{{ t('createInvite') }}</Button>
              </form><div v-if="createdInvite" class="generated-invite"><strong>{{ t('inviteCreated') }}</strong><div class="generated-link"><Input :model-value="createdInvite.link" readonly :aria-label="t('inviteCreated')" input-class="h-9 px-2 text-[10px]" /><Button variant="secondary" class="h-9 px-2.5 text-[10px]" @click="copyInviteLink">{{ t('copyLink') }}</Button></div><small>{{ t('inviteSecurity') }}</small></div><div v-if="operations.invites.length" class="invite-list"><div v-for="invite in operations.invites" :key="invite.id" class="invite-row"><div><strong>{{ invite.channel || t('defaultChannel') }}</strong><small>{{ invite.target }} · {{ formatDate(invite.expiresAt) }}</small></div><div class="invite-row-meta"><Chip :variant="invite.status === 'active' ? 'accent' : 'danger'">{{ inviteStatusLabel(invite.status) }}</Chip><span>{{ invite.useCount }}/{{ invite.maxUses || '∞' }}</span><Button v-if="invite.status === 'active'" variant="ghost" size="sm" :class="dangerSoftClass" @click="revokeInvite(invite)">{{ t('revoke') }}</Button></div></div></div></article>
          </div>
          <div class="operations-grid lower-operations">
            <article class="operation-card diagnostics-card"><header><div><h3>{{ t('diagnostics') }}</h3><p>{{ t('diagnosticsLead') }}</p></div><a class="text-link" href="/api/admin/diagnostics/report">{{ t('downloadReport') }}</a></header><dl class="diagnostic-list"><div><dt>{{ t('version') }}</dt><dd>{{ operations.diagnostics.version || '—' }}</dd></div><div><dt>{{ t('runtime') }}</dt><dd>{{ operations.diagnostics.node || '—' }}</dd></div><div><dt>{{ t('platform') }}</dt><dd>{{ operations.diagnostics.platform || '—' }} / {{ operations.diagnostics.arch || '—' }}</dd></div><div><dt>{{ t('databaseSchema') }}</dt><dd>v{{ operations.diagnostics.schemaVersion || '—' }}</dd></div><div><dt>{{ t('createdSessions') }}</dt><dd>{{ operations.diagnostics.createdSessions }}</dd></div></dl><Button variant="secondary" class="mt-auto" @click="downloadBackup">{{ t('exportBackup') }}</Button></article>
            <article class="operation-card logs-card"><header><div><h3>{{ t('logViewer') }}</h3><p>{{ t('logViewerLead') }}</p></div><span v-if="!operations.logs.available" class="muted-label">{{ t('logsUnavailable') }}</span></header><div v-if="operations.logs.sessions.length" class="connection-list" role="region" tabindex="0" :aria-label="t('connectionHistory')"><div class="connection-history-heading"><strong>{{ t('connectionHistory') }}</strong><small>{{ t('connectionHistoryLead') }}</small></div><div v-for="record in operations.logs.sessions" :key="record.id" class="connection-row"><div class="connection-person"><strong>{{ record.nickname }}</strong><small>{{ record.target }}</small><small class="connection-route">{{ connectionRoute(record) }}</small></div><div class="connection-detail"><span :class="['connection-status', record.status]">{{ connectionStatusLabel(record.status) }}</span><small>{{ record.connectedAt ? t('connectedAt') : t('connectionAttemptedAt') }}：{{ formatDate(record.connectedAt || record.startedAt) }}</small><small>{{ t('duration') }}：{{ formatAge(record.durationSeconds) }}</small><small v-if="record.disconnectedAt">{{ t('disconnectedAt') }}：{{ formatDate(record.disconnectedAt) }}</small><small v-if="record.reason">{{ t('failureReason') }}：{{ connectionFailureText(record.reason) }}</small><small v-if="record.failureDetail" class="failure-detail">{{ t('failureDetail') }}：{{ record.failureDetail }}</small></div></div></div><div v-if="operations.logs.entries.length" class="log-list" role="region" tabindex="0" :aria-label="t('logViewer')"><div v-for="(entry, index) in operations.logs.entries" :key="`${entry.timestamp}-${index}`" class="log-row"><span :class="['log-level', entry.level.toLowerCase()]">{{ entry.level }}</span><div><strong>{{ entry.message || '—' }}</strong><small>{{ formatDate(entry.timestamp) }}<template v-if="Object.keys(entry.context).length"> · {{ formatContext(entry.context) }}</template></small></div></div></div><div v-if="!operations.logs.sessions.length && !operations.logs.entries.length" class="operation-empty"><Icon name="activity" :size="22" /><span>{{ t('noLogs') }}</span></div></article>
            <article class="operation-card audit-card"><header><div><h3>{{ t('audit') }}</h3><p>{{ t('auditLead') }}</p></div></header><ul class="event-list"><li v-for="event in operations.audit" :key="`${event.event}-${event.createdAt}`"><span><Icon name="check" :size="14" /></span><div><strong>{{ eventName(event.event) }}</strong><small>{{ formatDate(event.createdAt) }}</small></div></li><li v-if="!operations.audit.length" class="empty-event">{{ t('auditEmpty') }}</li></ul></article>
          </div>
        </section>

        <section v-else class="page-content overview-page">
          <Banner v-if="overview.legacyConfigImported" class="import-notice py-2.5 text-xs leading-[normal]">
            {{ t('legacyImported') }}
            <template #actions><Button size="sm" variant="ghost" class="font-extrabold text-accent" @click="dismissLegacyNotice">{{ t('gotIt') }}</Button></template>
          </Banner>
          <div class="hero-status"><div><small>{{ t('systemStatus') }}</small><h2>{{ t('everythingRunning') }}</h2><p>{{ t('overviewLead') }}</p></div><Chip variant="success" dot class="bg-surface-1 max-[520px]:hidden">{{ t('running') }}</Chip></div>
          <div class="metric-grid"><Card as="article" flush class="leading-[normal]"><span class="metric-icon"><Icon name="activity" :size="20" /></span><small>{{ t('gateway') }}</small><strong>{{ overview.gateway.version || '—' }}</strong><em>{{ formatUptime(overview.gateway.uptimeSeconds) }}</em></Card><Card as="article" flush class="leading-[normal]"><span class="metric-icon"><Icon name="server" :size="20" /></span><small>{{ t('teamSpeakTarget') }}</small><strong>{{ overview.teamSpeak.target || '—' }}</strong><em>{{ targetStatusText }}</em></Card><Card as="article" flush class="leading-[normal]"><span class="metric-icon"><Icon name="users" :size="20" /></span><small>{{ t('activeSessions') }}</small><strong>{{ overview.sessions.active }} / {{ overview.sessions.limit }}</strong><em>{{ t('peakSessions', { count: overview.sessions.peak }) }}</em></Card></div>
          <div class="overview-columns"><Card as="article" flush class="overview-card target-health-card leading-[normal]"><header><div><h3>{{ t('targetHealth') }}</h3><p>{{ t('targetHealthLead') }}</p></div><RouterLink to="/admin/server">{{ t('manage') }}</RouterLink></header><dl><div><dt>{{ t('status') }}</dt><dd><i :class="overview.teamSpeak.status"></i>{{ targetStatusText }}</dd></div><div><dt>{{ t('lastTest') }}</dt><dd>{{ formatDate(overview.teamSpeak.lastTestAt) }}</dd></div><div><dt>{{ t('latency') }}</dt><dd>{{ overview.teamSpeak.latencyMs == null ? '—' : `${overview.teamSpeak.latencyMs} ms` }}</dd></div></dl></Card><article class="overview-card recent-events-card"><header><div><h3>{{ t('recentEvents') }}</h3><p>{{ t('recentEventsLead') }}</p></div></header><ul class="event-list"><li v-for="event in overview.recentEvents" :key="`${event.event}-${event.createdAt}`"><span><Icon name="check" :size="14" /></span><div><strong>{{ eventName(event.event) }}</strong><small>{{ formatDate(event.createdAt) }}</small></div></li><li v-if="!overview.recentEvents.length" class="empty-event">{{ t('noRecentEvents') }}</li></ul></article></div>
        </section>
        <Dialog v-model="webrtcPortNoticeOpen" size="sm" :title="t('webrtcPortNoticeTitle')" :description="t('webrtcPortNotice', { range: webrtcPortRangeText })" :close-label="t('close')">
          <template #footer><Button class="w-full" @click="webrtcPortNoticeOpen = false">{{ t('gotIt') }}</Button></template>
        </Dialog>
      </main>
    </div>
    <Toaster :label="t('notifications')" :dismiss-label="t('close')" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Label } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/toast";
import { Segment, Segmented } from "@/components/ui/tabs";
import LanguageSwitcher from "../components/LanguageSwitcher.vue";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "../services/teamspeak-target.js";
import { applyTheme, getStoredTheme, isDarkTheme, nextTheme, saveTheme, type ThemeMode } from "../services/theme.js";
import { toast } from "@/lib/use-toast";
import { useI18n } from "@/i18n/use-i18n";

type Screen = "login" | "change-password" | "admin";
type AccessMode = "fixed" | "open";
interface HostPing { ok: boolean; latencyMs: number | null; packetLossPercent: number; attempts: number; successfulAttempts: number; errorCode?: string }
interface ProbeState { ok: boolean; latencyMs?: number | null; hostPing?: HostPing; code?: string; errorCode?: string }
interface RelayNodeForm { id: string; name: string; enabled: boolean; target: string; token: string; tokenAction: "keep" | "replace" | "remove"; hasToken: boolean }
type WelcomeLanguage = "zh" | "en" | "de" | "ru" | "ja";
type WelcomeTextField = "welcomeText" | "welcomeTextEn" | "welcomeTextDe" | "welcomeTextRu" | "welcomeTextJa";

const DEFAULT_WELCOME_TEXTS: Record<WelcomeLanguage, string> = {
  zh: "无需安装 TeamSpeak 客户端，打开浏览器即可加入语音频道。低延迟、轻量、专注于每一次对话。",
  en: "No TeamSpeak client installation required. Open your browser and join a voice channel with low-latency audio built for conversation.",
  de: "Keine Installation des TeamSpeak-Clients nötig. Öffne den Browser und tritt einem Sprachkanal bei – leichtgewichtig und mit geringer Latenz.",
  ru: "Устанавливать клиент TeamSpeak не нужно: откройте браузер и присоединитесь к голосовому каналу. Низкая задержка и удобное общение в каждом разговоре.",
  ja: "TeamSpeak クライアントのインストールは不要です。ブラウザを開くだけで音声チャンネルに参加できます。低遅延で軽快な会話を楽しめます。",
};

const route = useRoute();
const router = useRouter();
const { language, t, setLanguage } = useI18n();
const themeMode = ref<ThemeMode>(getStoredTheme());
const themeIcon = computed(() => isDarkTheme(themeMode.value) ? "sun" : "moon");
const themeLabel = computed(() => isDarkTheme(themeMode.value) ? t("switchToLightTheme") : t("switchToDarkTheme"));
applyTheme(themeMode.value);
const loading = ref(true);
const screen = ref<Screen>("login");
const csrfToken = ref("");
const submitting = ref(false);
const testing = ref(false);
const errorMessage = ref("");
// Look of the sidebar footer actions (Open guest page, Log out): quiet, full width, left aligned.
const sidebarActionClass = "h-auto justify-start gap-2.5 rounded-[9px] px-3 py-[11px] text-xs font-bold text-fg-muted";
const loginUsername = ref("admin");
const loginPassword = ref("");
const newPassword = ref("");
const confirmNewPassword = ref("");
const testResult = ref<ProbeState | null>(null);

const serverForm = reactive({ address: "", port: "9987", serverPassword: "", passwordAction: "keep" as "keep" | "replace" | "remove", hasPassword: false, accessMode: "fixed" as AccessMode, siteName: "WebSpeak", welcomeText: "", welcomeTextEn: "", welcomeTextDe: "", welcomeTextRu: "", welcomeTextJa: "", welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS }, webRtcEnabled: false, webRtcUdpStart: 40000, webRtcUdpEnd: 40099, relayConfigured: false, relayEnabled: false, relayName: "", relayTarget: "", relayToken: "", relayTokenAction: "keep" as "keep" | "replace" | "remove", hasRelayToken: false, relaySettingsTouched: false, relayNodes: [] as RelayNodeForm[], lastTestAt: null as string | null, lastTestLatencyMs: null as number | null });
const welcomeLanguage = ref<WelcomeLanguage>("zh");
const dangerSoftClass = "h-7 bg-danger-soft px-2 text-[10px] text-[var(--color-danger)] hover:bg-danger-soft";
// The invite card sits in a fixed-height row, so its controls are 34 px tall.
const inviteInputClass = "h-[34px] px-2.5 py-[7px]";
const choiceClass = "w-full rounded-md border border-line p-2.5 has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-surface-0";
const overview = reactive({ gateway: { version: "", uptimeSeconds: 0 }, teamSpeak: { target: "", status: "unknown", lastTestAt: null as string | null, latencyMs: null as number | null }, sessions: { active: 0, peak: 0, limit: 100 }, recentEvents: [] as Array<{ event: string; createdAt: string }>, legacyConfigImported: false });
interface AdminSession { id: string; nickname: string; target: string; state: string; createdAt: string; ageSeconds: number; tsClientId: number | null; channelId: string | null; memberCount: number }
interface ManagedInvite { id: string; target: string; channel: string; expiresAt: string; maxUses: number; useCount: number; createdAt: string; revokedAt: string | null; status: "active" | "expired" | "exhausted" | "revoked" }
interface AdminLog { timestamp: string | null; level: string; message: string; context: Record<string, string | number | boolean> }
interface AdminConnectionRecord { id: string; nickname: string; clientIp: string; target: string; relayName: string | null; relayTarget: string | null; startedAt: string; connectedAt: string | null; disconnectedAt: string | null; durationSeconds: number | null; status: "active" | "connecting" | "disconnected" | "failed"; reason: string | null; failureDetail: string | null }
const operationsLoading = ref(false);
const terminatingSession = ref("");
const inviteForm = reactive({ channel: "", expiresInHours: 24, maxUses: 0 });
const createdInvite = ref<{ token: string; link: string } | null>(null);
const webrtcPortNoticeOpen = ref(false);
const operations = reactive({ sessions: [] as AdminSession[], invites: [] as ManagedInvite[], diagnostics: { version: "", node: "", platform: "", arch: "", schemaVersion: 0, createdSessions: 0 }, logs: { available: false, entries: [] as AdminLog[], sessions: [] as AdminConnectionRecord[] }, audit: [] as Array<{ event: string; createdAt: string }> });

const welcomeLanguageOptions: Array<{ value: WelcomeLanguage; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "ru", label: "Русский" },
  { value: "ja", label: "日本語" },
];

const welcomeTextFieldByLanguage: Record<WelcomeLanguage, WelcomeTextField> = {
  zh: "welcomeText",
  en: "welcomeTextEn",
  de: "welcomeTextDe",
  ru: "welcomeTextRu",
  ja: "welcomeTextJa",
};

const selectedWelcomeText = computed<string>({
  get: () => serverForm[welcomeTextFieldByLanguage[welcomeLanguage.value]],
  set: (value: string) => { serverForm[welcomeTextFieldByLanguage[welcomeLanguage.value]] = value; },
});
const selectedWelcomeLanguageLabel = computed(() => welcomeLanguageOptions.find((option) => option.value === welcomeLanguage.value)?.label ?? "");
const selectedWelcomeDefault = computed(() => serverForm.welcomeDefaults[welcomeLanguage.value] || DEFAULT_WELCOME_TEXTS[welcomeLanguage.value]);

const passwordStrength = computed(() => Math.min(100, Math.max(8, newPassword.value.length * 5 + (/[\s\W]/.test(newPassword.value) ? 15 : 0))));
const currentPageTitle = computed(() => route.path === "/admin/server" ? t('server') : route.path === "/admin/operations" ? t('operations') : t('overview'));
const testResultTitle = computed(() => {
  const result = testResult.value;
  if (!result) return "";
  if (result.ok) return t("serverAnswered");
  const names: Record<string, string> = {
    INVALID_TARGET: "serverAddress",
    INVALID_NICKNAME: "invalidNicknameError",
    HOST_NOT_FOUND: "hostNotFoundError",
    UNREACHABLE: "networkUnreachableError",
    CONNECTION_REFUSED: "connectionRefusedError",
    CONNECTION_RESET: "connectionResetError",
    TIMEOUT: "networkTimeoutError",
    PASSWORD_REQUIRED: "serverPasswordRequiredError",
    INVALID_PASSWORD: "invalidServerPasswordError",
    PROTOCOL_NEGOTIATION_FAILED: "protocolFailureError",
    SERVER_REJECTED: "serverRejectedError",
    NO_ANSWER: "noAnswerError",
    PING_UNAVAILABLE: "pingUnavailableError",
  };
  return t(names[result.code ?? result.errorCode ?? ""] ?? "connectionFailed");
});
const testResultText = computed(() => {
  const result = testResult.value;
  if (!result) return "";
  const ping = result.hostPing;
  const hostPing = !ping || ping.errorCode === "PING_UNAVAILABLE" ? null : ping.ok ? `${t('hostPing')} ${ping.latencyMs} ms · ${t('packetLossRate')} ${ping.packetLossPercent}%` : t('hostPingNoAnswer');
  if (result.ok) return [t("serverAnsweredHint"), result.latencyMs == null ? null : `${result.latencyMs} ms`, hostPing].filter(Boolean).join(" · ");
  const code = result.code ?? result.errorCode;
  return [code === "NO_ANSWER" ? t("noAnswerHint") : connectionFailureText(code), hostPing].filter(Boolean).join(" · ");
});
const targetStatusText = computed(() => overview.teamSpeak.status === "reachable" ? t('reachable') : overview.teamSpeak.status === "unreachable" ? t('unreachable') : t('notTested'));
const webrtcPortRangeText = computed(() => `${serverForm.webRtcUdpStart}–${serverForm.webRtcUdpEnd}`);

onMounted(loadAdminView);
watch(() => [serverForm.address, serverForm.port], () => { if (!testing.value && screen.value === "admin") testResult.value = null; });
watch(() => route.path, () => { if (screen.value === "admin" && route.path === "/admin/operations") void loadOperations(); });

async function loadAdminView() { loading.value = true; try { const session = await getJson("/api/admin/session"); if (!session.authenticated) { screen.value = "login"; if (route.path !== "/admin/login") await router.replace("/admin/login"); } else if (session.mustChangePassword) { csrfToken.value = String(session.csrfToken || ""); screen.value = "change-password"; if (route.path !== "/admin/change-password") await router.replace("/admin/change-password"); } else { csrfToken.value = String(session.csrfToken || ""); screen.value = "admin"; if (route.path === "/admin/login" || route.path === "/admin/change-password") await router.replace("/admin"); await Promise.all([loadOverview(), loadServerSettings()]); if (route.path === "/admin/operations") await loadOperations(); } } catch { errorMessage.value = t('requestFailed'); } finally { loading.value = false; } }
async function login() { submitting.value = true; errorMessage.value = ""; try { const result = await sendJson("/api/admin/login", "POST", { username: loginUsername.value.trim(), password: loginPassword.value }, false); csrfToken.value = String(result.csrfToken || ""); loginPassword.value = ""; if (result.mustChangePassword) { screen.value = "change-password"; await router.replace("/admin/change-password"); } else { screen.value = "admin"; await router.replace("/admin"); await Promise.all([loadOverview(), loadServerSettings()]); } } catch (error) { errorMessage.value = errorText((error as ApiError).code); } finally { submitting.value = false; } }
async function changePassword() { errorMessage.value = ""; if (newPassword.value.length < 12) { errorMessage.value = t('setupPasswordShort'); return; } if (newPassword.value !== confirmNewPassword.value) { errorMessage.value = t('setupPasswordsMismatch'); return; } submitting.value = true; try { await sendJson("/api/admin/change-password", "POST", { newPassword: newPassword.value }); newPassword.value = ""; confirmNewPassword.value = ""; screen.value = "admin"; await router.replace("/admin"); await Promise.all([loadOverview(), loadServerSettings()]); } catch (error) { errorMessage.value = errorText((error as ApiError).code); } finally { submitting.value = false; } }
async function logout() { try { await sendJson("/api/admin/logout", "POST", {}); } finally { csrfToken.value = ""; screen.value = "login"; await router.replace("/admin/login"); } }
async function loadOverview() { Object.assign(overview, await getJson("/api/admin/overview")); }
function mapRelayNodes(value: unknown): RelayNodeForm[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const node = item as { id?: unknown; name?: unknown; enabled?: unknown; target?: unknown; hasToken?: unknown };
    if (typeof node.id !== "string" || typeof node.name !== "string" || typeof node.target !== "string") return [];
    return [{ id: node.id, name: node.name, enabled: node.enabled === true, target: node.target, token: "", tokenAction: "keep" as const, hasToken: node.hasToken === true }];
  });
}
function createRelayNode(): RelayNodeForm { return { id: `relay-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: "", enabled: false, target: "", token: "", tokenAction: "replace", hasToken: false }; }
function addRelayNode() { serverForm.relayNodes.push(createRelayNode()); serverForm.relaySettingsTouched = true; }
function removeRelayNode(index: number) { serverForm.relayNodes.splice(index, 1); serverForm.relaySettingsTouched = true; }
async function loadServerSettings() { const value = await getJson("/api/admin/server"); const target = splitTeamSpeakTarget(value.target); Object.assign(serverForm, value, { address: target.address, port: target.port, serverPassword: "", passwordAction: "keep", welcomeTextDe: String(value.welcomeTextDe || ""), welcomeTextRu: String(value.welcomeTextRu || ""), welcomeTextJa: String(value.welcomeTextJa || ""), welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS, ...(value.welcomeDefaults && typeof value.welcomeDefaults === "object" ? value.welcomeDefaults : {}) }, webRtcEnabled: value.webRtcEnabled === true, webRtcUdpStart: Number(value.webRtcUdpStart || 40000), webRtcUdpEnd: Number(value.webRtcUdpEnd || 40099), relayConfigured: value.relayConfigured === true, relayEnabled: value.relayEnabled === true, relayName: String(value.relayName || ""), relayTarget: String(value.relayTarget || ""), relayToken: "", relayTokenAction: "keep", hasRelayToken: value.hasRelayToken === true, relaySettingsTouched: false, relayNodes: mapRelayNodes(value.relayNodes) }); }
async function loadOperations() { operationsLoading.value = true; try { const [sessions, invites, diagnostics, logs, audit] = await Promise.all([getJson("/api/admin/sessions"), getJson("/api/admin/invites"), getJson("/api/admin/diagnostics"), getJson("/api/admin/logs?limit=100"), getJson("/api/admin/audit?limit=50")]); operations.sessions = Array.isArray(sessions.sessions) ? sessions.sessions : []; operations.invites = Array.isArray(invites.invites) ? invites.invites : []; operations.diagnostics = { version: String(diagnostics.gateway?.version || ""), node: String(diagnostics.gateway?.node || ""), platform: String(diagnostics.gateway?.platform || ""), arch: String(diagnostics.gateway?.arch || ""), schemaVersion: Number(diagnostics.database?.schemaVersion || 0), createdSessions: Number(diagnostics.sessions?.created || 0) }; operations.logs = { available: Boolean(logs.available), entries: Array.isArray(logs.entries) ? logs.entries : [], sessions: Array.isArray(logs.sessions) ? logs.sessions : [] }; operations.audit = Array.isArray(audit.events) ? audit.events : []; } catch (error) { errorMessage.value = errorText((error as ApiError).code); } finally { operationsLoading.value = false; } }
async function terminateSession(session: AdminSession) { if (!window.confirm(t('confirmTerminate', { nickname: session.nickname }))) return; terminatingSession.value = session.id; errorMessage.value = ""; try { await sendJson(`/api/admin/sessions/${encodeURIComponent(session.id)}/terminate`, "POST", {}); await Promise.all([loadOperations(), loadOverview()]); showOperationNotice(t('sessionTerminated')); } catch (error) { errorMessage.value = errorText((error as ApiError).code); } finally { terminatingSession.value = ""; } }
async function createInvite() { submitting.value = true; errorMessage.value = ""; createdInvite.value = null; try { const result = await sendJson("/api/admin/invites", "POST", { channel: inviteForm.channel, expiresInHours: inviteForm.expiresInHours, maxUses: inviteForm.maxUses }); if (typeof result.token !== "string") throw new Error("INVITE_CREATE_FAILED"); createdInvite.value = { token: result.token, link: `${location.origin}/?invite=${encodeURIComponent(result.token)}` }; inviteForm.channel = ""; await loadOperations(); } catch (error) { errorMessage.value = errorText((error as ApiError).code); } finally { submitting.value = false; } }
async function revokeInvite(invite: ManagedInvite) { if (!window.confirm(t('confirmRevoke'))) return; try { await sendJson(`/api/admin/invites/${encodeURIComponent(invite.id)}/revoke`, "POST", {}); await loadOperations(); showOperationNotice(t('inviteRevoked')); } catch (error) { errorMessage.value = errorText((error as ApiError).code); } }
async function copyInviteLink() { if (!createdInvite.value) return; try { await navigator.clipboard.writeText(createdInvite.value.link); showOperationNotice(t('copiedLink')); } catch { errorMessage.value = t('operationFailed'); } }
// Every successful action of the console says so in a toast; a failure stays a banner (errorMessage).
function showOperationNotice(message: string) { toast({ title: message, variant: "success" }); }
async function downloadBackup() { try { const response = await fetch("/api/admin/backup", { headers: { accept: "application/octet-stream" } }); if (!response.ok) throw new Error("BACKUP_FAILED"); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `webspeak-backup-${new Date().toISOString().slice(0, 10)}.db`; anchor.click(); URL.revokeObjectURL(url); await loadOperations(); } catch (error) { errorMessage.value = errorText((error as ApiError).code); } }
async function saveServerSettings() { submitting.value = true; errorMessage.value = ""; try { const result = await sendJson("/api/admin/server", "PUT", serverPayload()); const target = splitTeamSpeakTarget(result.settings?.target); Object.assign(serverForm, result.settings, { address: target.address, port: target.port, serverPassword: "", passwordAction: "keep", welcomeTextDe: String(result.settings.welcomeTextDe || ""), welcomeTextRu: String(result.settings.welcomeTextRu || ""), welcomeTextJa: String(result.settings.welcomeTextJa || ""), welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS, ...(result.settings.welcomeDefaults && typeof result.settings.welcomeDefaults === "object" ? result.settings.welcomeDefaults : {}) }, webRtcEnabled: result.settings.webRtcEnabled === true, webRtcUdpStart: Number(result.settings.webRtcUdpStart || 40000), webRtcUdpEnd: Number(result.settings.webRtcUdpEnd || 40099), relayConfigured: result.settings.relayConfigured === true, relayEnabled: result.settings.relayEnabled === true, relayName: String(result.settings.relayName || ""), relayTarget: String(result.settings.relayTarget || ""), relayToken: "", relayTokenAction: "keep", hasRelayToken: result.settings.hasRelayToken === true, relaySettingsTouched: false, relayNodes: mapRelayNodes(result.settings.relayNodes) }); await loadOverview(); showOperationNotice(t('settingsSaved')); } catch (error) { errorMessage.value = errorText((error as ApiError).code); } finally { submitting.value = false; } }
function handleWebRtcToggle() { if (serverForm.webRtcEnabled) webrtcPortNoticeOpen.value = true; }
async function testServerConnection() { await runTest("/api/admin/server/test", { target: combineTeamSpeakTarget(serverForm.address, serverForm.port) }); if (testResult.value) { await loadOverview(); serverForm.lastTestAt = new Date().toISOString(); serverForm.lastTestLatencyMs = testResult.value.ok ? (testResult.value.latencyMs ?? null) : null; } }
function touchRelaySettings() { serverForm.relaySettingsTouched = true; }
function serverPayload() { return { target: combineTeamSpeakTarget(serverForm.address, serverForm.port), serverPassword: serverForm.passwordAction === "replace" ? serverForm.serverPassword : undefined, passwordAction: serverForm.passwordAction, accessMode: serverForm.accessMode, siteName: serverForm.siteName, welcomeText: serverForm.welcomeText, welcomeTextEn: serverForm.welcomeTextEn, welcomeTextDe: serverForm.welcomeTextDe, welcomeTextRu: serverForm.welcomeTextRu, welcomeTextJa: serverForm.welcomeTextJa, webRtcEnabled: serverForm.webRtcEnabled, webRtcUdpStart: serverForm.webRtcUdpStart, webRtcUdpEnd: serverForm.webRtcUdpEnd, relayNodes: serverForm.relayNodes.map((node) => ({ id: node.id, name: node.name, target: node.target, enabled: node.enabled, tokenAction: node.tokenAction, ...(node.tokenAction === "replace" ? { token: node.token } : {}) })) }; }
async function runTest(url: string, body: Record<string, unknown>) { testing.value = true; errorMessage.value = ""; testResult.value = null; try { testResult.value = await sendJson(url, "POST", body, url.includes("/server/test")); } catch (error) { testResult.value = { ok: false, code: (error as ApiError).code }; } finally { testing.value = false; } }
async function dismissLegacyNotice() { await sendJson("/api/admin/legacy-import/dismiss", "POST", {}); overview.legacyConfigImported = false; }
function persistLanguage() { setLanguage(language.value); }
function cycleTheme() { themeMode.value = nextTheme(themeMode.value); saveTheme(themeMode.value); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(language.value === "zh" ? "zh-CN" : language.value === "de" ? "de-DE" : language.value === "ru" ? "ru-RU" : language.value === "ja" ? "ja-JP" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function formatUptime(seconds: number) { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); if (language.value === "zh") return `已运行 ${hours} 小时 ${minutes} 分钟`; if (language.value === "de") return `${hours} Std. ${minutes} Min. aktiv`; if (language.value === "ru") return `Работает ${hours} ч ${minutes} мин`; if (language.value === "ja") return `${hours}時間 ${minutes}分 稼働`; return `Up ${hours}h ${minutes}m`; }
function formatAge(seconds: number | null) { if (seconds == null) return "—"; if (seconds < 60) { if (language.value === "zh") return `${seconds} 秒`; if (language.value === "de") return `${seconds} Sek.`; if (language.value === "ru") return `${seconds} с`; if (language.value === "ja") return `${seconds}秒`; return `${seconds}s`; } const minutes = Math.floor(seconds / 60); if (minutes < 60) { if (language.value === "zh") return `${minutes} 分钟`; if (language.value === "de") return `${minutes} Min.`; if (language.value === "ru") return `${minutes} мин`; if (language.value === "ja") return `${minutes}分`; return `${minutes}m`; } const hours = Math.floor(minutes / 60); const rest = minutes % 60; if (language.value === "zh") return `${hours} 小时 ${rest} 分钟`; if (language.value === "de") return `${hours} Std. ${rest} Min.`; if (language.value === "ru") return `${hours} ч ${rest} мин`; if (language.value === "ja") return `${hours}時間 ${rest}分`; return `${hours}h ${rest}m`; }
function connectionStatusLabel(status: AdminConnectionRecord["status"]) { const names: Record<AdminConnectionRecord["status"], string> = { active: "connectionActive", connecting: "connectionConnecting", disconnected: "connectionDisconnected", failed: "connectionFailed" }; return t(names[status]); }
function connectionRoute(record: AdminConnectionRecord) {
  const route = t("connectionFromTo", { ip: record.clientIp || "—", target: record.target || "—" });
  if (!record.relayName && !record.relayTarget) return route;
  const relay = [record.relayName, record.relayTarget].filter(Boolean).join(" · ") || "—";
  return `${route} · ${t("connectionViaRelay", { relay })}`;
}
function sessionStateLabel(state: string) { const names: Record<string, { zh: string; en: string; de: string }> = { connecting: { zh: "连接中", en: "Connecting", de: "Verbindung wird hergestellt" }, authenticating: { zh: "认证中", en: "Authenticating", de: "Authentifizierung" }, syncing: { zh: "同步中", en: "Syncing", de: "Synchronisierung" }, connected: { zh: "已连接", en: "Connected", de: "Verbunden" }, interrupted: { zh: "已中断", en: "Interrupted", de: "Unterbrochen" }, reconnecting: { zh: "重连中", en: "Reconnecting", de: "Wiederverbindung" }, disconnecting: { zh: "断开中", en: "Disconnecting", de: "Wird getrennt" }, failed: { zh: "失败", en: "Failed", de: "Fehlgeschlagen" }, idle: { zh: "空闲", en: "Idle", de: "Inaktiv" } }; const locale = language.value === "zh" ? "zh" : language.value === "de" ? "de" : "en"; return names[state]?.[locale] ?? state; }
function inviteStatusLabel(status: ManagedInvite["status"]) { const names: Record<ManagedInvite["status"], string> = { active: "active", expired: "expired", exhausted: "exhausted", revoked: "revoked" }; return t(names[status]); }
function formatContext(context: Record<string, string | number | boolean>) { return Object.entries(context).map(([key, value]) => `${key}=${value}`).join(" · "); }
function eventName(event: string) { if (event === "ADMIN_LOGIN_FAILED") return language.value === "zh" ? "管理员登录失败" : language.value === "ru" ? "Ошибка входа администратора" : language.value === "ja" ? "管理者ログイン失敗" : language.value === "de" ? "Administrator-Anmeldung fehlgeschlagen" : "Administrator login failed"; if (event === "CONNECTION_TEST_SUCCEEDED") return language.value === "zh" ? "连接测试成功" : language.value === "ru" ? "Проверка подключения успешна" : language.value === "ja" ? "接続テスト成功" : language.value === "de" ? "Verbindungstest erfolgreich" : "Connection test succeeded"; if (event === "CONNECTION_TEST_FAILED") return language.value === "zh" ? "连接测试失败" : language.value === "ru" ? "Проверка подключения не удалась" : language.value === "ja" ? "接続テスト失敗" : language.value === "de" ? "Verbindungstest fehlgeschlagen" : "Connection test failed"; const names: Record<string, string> = { ADMIN_LOGIN_SUCCEEDED: "loginEvent", ADMIN_LOGOUT: "logoutEvent", SETTINGS_CHANGED: "settingsEvent", ADMIN_INITIALIZED: "initializedEvent", LEGACY_CONFIG_IMPORTED: "importedEvent", CONNECTION_TEST: "testEvent" }; return names[event] ? t(names[event]) : language.value === "zh" ? "系统事件" : event.replaceAll("_", " "); }
function errorText(code?: string) {
  if (code === "INVALID_PASSWORD") return t('invalidPassword');
  if (code === "INVALID_ADMIN_PASSWORD") return t('setupPasswordShort');
  if (code === "PASSWORD_CHANGE_REQUIRED") return t('changePasswordLead');
  if (code === "RATE_LIMITED") return t('rateLimited');
  if (code === "INVALID_WEBRTC_PORT_RANGE") {
    if (language.value === "zh") return "WebRTC UDP 端口范围无效，请填写 1024–65535 且起始端口不能大于结束端口。";
    if (language.value === "de") return "Der WebRTC-UDP-Portbereich ist ungültig. Verwende 1024–65535; der Startport darf nicht größer als der Endport sein.";
    if (language.value === "ru") return "Диапазон UDP-портов WebRTC некорректен. Используйте 1024–65535; начальный порт не может быть больше конечного.";
    if (language.value === "ja") return "WebRTC UDP ポート範囲が正しくありません。1024–65535 の範囲で、開始ポートを終了ポート以下にしてください。";
    return "The WebRTC UDP port range is invalid. Use 1024–65535 with the start no greater than the end.";
  }
  if (code === "WEBRTC_PORT_LOCKED") {
    if (language.value === "zh") return "WebRTC 已开启，请先关闭并保存后再修改端口范围。";
    if (language.value === "de") return "WebRTC ist aktiviert. Deaktiviere es und speichere zuerst, bevor du den Portbereich änderst.";
    if (language.value === "ru") return "WebRTC включён. Сначала отключите его и сохраните настройки, затем изменяйте диапазон портов.";
    if (language.value === "ja") return "WebRTC が有効です。ポート範囲を変更する前に無効にして保存してください。";
    return "WebRTC is enabled. Turn it off and save before changing the port range.";
  }
  const locale = language.value === "zh" ? "zh" : language.value === "de" ? "de" : "en";
  const relayErrors: Record<string, { zh: string; en: string; de: string }> = {
    INVALID_RELAY_NAME: { zh: "中继名称无效或为空。", en: "The relay name is invalid or empty.", de: "Der Relay-Name ist ungültig oder leer." },
    INVALID_RELAY_TARGET: { zh: "中继服务器地址无效。", en: "The relay server address is invalid.", de: "Die Relay-Serveradresse ist ungültig." },
    INVALID_RELAY_TOKEN: { zh: "启用中继时必须填写令牌。", en: "A relay token is required when the relay is enabled.", de: "Beim Aktivieren des Relays ist ein Token erforderlich." },
  };
  if (relayErrors[code || ""]) return relayErrors[code || ""][locale];
  const probe: Record<string, { zh: string; en: string; de: string }> = {
    INVALID_TARGET: { zh: "TeamSpeak 服务器地址格式无效。", en: "The TeamSpeak server address is invalid.", de: "Die TeamSpeak-Serveradresse ist ungültig." },
    PING_UNAVAILABLE: { zh: "当前运行环境没有可用的 ICMP Ping 工具。", en: "The runtime does not provide an ICMP ping tool.", de: "In der Laufzeitumgebung ist kein ICMP-Ping-Tool verfügbar." },
    HOST_NOT_FOUND: { zh: "找不到服务器主机名。", en: "The server hostname could not be resolved.", de: "Der Servername konnte nicht aufgelöst werden." },
    UNREACHABLE: { zh: "无法连接 TeamSpeak 服务器。", en: "The TeamSpeak server is unreachable.", de: "Der TeamSpeak-Server ist nicht erreichbar." },
    TIMEOUT: { zh: "连接 TeamSpeak 超时。", en: "The TeamSpeak connection timed out.", de: "Die Verbindung zu TeamSpeak ist abgelaufen." },
    PROTOCOL_NEGOTIATION_FAILED: { zh: "无法识别 TeamSpeak 协议。", en: "TeamSpeak protocol negotiation failed.", de: "Die Aushandlung des TeamSpeak-Protokolls ist fehlgeschlagen." },
    SERVER_REJECTED: { zh: "TeamSpeak 服务器拒绝了连接。", en: "The TeamSpeak server rejected the connection.", de: "Der TeamSpeak-Server hat die Verbindung abgelehnt." },
    TARGET_NOT_ALLOWED: { zh: "此地址不允许在开放模式中使用。", en: "This target is not allowed in open mode.", de: "Dieses Ziel ist im offenen Modus nicht erlaubt." },
  };
  return probe[code || ""]?.[locale] ?? t('requestFailed');
}

function connectionFailureText(code?: string) {
  const names: Record<string, string> = {
    PASSWORD_REQUIRED: "serverPasswordRequiredError",
    SERVER_PASSWORD_REQUIRED: "serverPasswordRequiredError",
  INVALID_PASSWORD: "invalidServerPasswordError",
  INVALID_SERVER_PASSWORD: "invalidServerPasswordError",
    INVALID_TARGET: "serverAddress",
    INVALID_NICKNAME: "invalidNicknameError",
  HOST_NOT_FOUND: "hostNotFoundError",
  UNREACHABLE: "networkUnreachableError",
  CONNECTION_REFUSED: "connectionRefusedError",
  CONNECTION_RESET: "connectionResetError",
  TIMEOUT: "networkTimeoutError",
    PROTOCOL_NEGOTIATION_FAILED: "protocolFailureError",
    SERVER_REJECTED: "serverRejectedError",
  NO_ANSWER: "noAnswerError",
  PING_UNAVAILABLE: "pingUnavailableError",
  CONNECTION_FAILED: "connectionFailed",
  };
  return names[code || ""] ? t(names[code || ""]) : errorText(code);
}

interface ApiError extends Error { code?: string }
async function getJson(url: string): Promise<any> { const response = await fetch(url, { headers: { accept: "application/json" } }); return parseResponse(response); }
async function sendJson(url: string, method: string, body: unknown, authenticated = true): Promise<any> { const response = await fetch(url, { method, headers: { "content-type": "application/json", accept: "application/json", ...(authenticated && csrfToken.value ? { "x-csrf-token": csrfToken.value } : {}) }, body: JSON.stringify(body) }); return parseResponse(response); }
async function parseResponse(response: Response) { const value = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(String(value.code || response.statusText)) as ApiError; error.code = String(value.code || "REQUEST_FAILED"); if (response.status === 401 && screen.value === "admin") { screen.value = "login"; void router.replace("/admin/login"); } throw error; } return value; }
</script>

<style scoped>
:global(*) { box-sizing: border-box; }
:global(body) { margin: 0; font-family: var(--font-sans); color: var(--ws-fg); background: var(--ws-surface-0); }
.admin-root { min-height: 100dvh; line-height: normal; }
.admin-brand { display: flex; align-items: center; gap: 12px; }
.admin-brand>span { display: grid; place-items: center; width: 42px; height: 42px; color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 12px; box-shadow: var(--shadow-sm); }
.admin-brand strong, .admin-brand small { display: block; }
.admin-brand strong { font-size: 20px; letter-spacing: -.04em; }
.admin-brand small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 11px; }
.language-link { color: var(--ws-accent); background: var(--ws-accent-soft); border: 1px solid var(--ws-line); border-radius: 8px; padding: 8px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
.login-card { width: min(560px,100%); padding: 36px; background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 20px; box-shadow: 0 20px 55px color-mix(in srgb, var(--ws-accent) 9%, transparent); }
.login-card h1 { margin: 10px 0 7px; font-size: 29px; font-weight: 700; letter-spacing: -.045em; }
.login-card header p { margin: 0; color: var(--ws-fg-muted); font-size: 13px; line-height: 1.6; }
.login-card form { display: grid; gap: 17px; margin-top: 27px; }
label>span { display: block; margin-bottom: 7px; color: var(--ws-fg); font-size: 12px; font-weight: 700; }
label em { color: var(--ws-fg-muted); font-size: 10px; font-style: normal; font-weight: 500; }
label small { display: block; margin-top: 6px; color: var(--ws-fg-muted); font-size: 10px; line-height: 1.5; }
input { width: 100%; padding: 11px 12px; color: var(--ws-fg); background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 9px; font: inherit; font-size: 13px; outline: none; }
input { height: 43px; }
input:focus { border-color: var(--ws-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ws-accent) 13%, transparent); }
.strength { height: 4px; overflow: hidden; background: var(--ws-surface-2); border-radius: 4px; }
.strength i { display: block; height: 100%; background: linear-gradient(90deg,var(--ws-warning),var(--ws-accent)); transition: .2s; }
.spinner { display: inline-block; width: 22px; height: 22px; border: 2px solid var(--ws-line); border-top-color: color-mix(in srgb, var(--ws-accent) 85%, var(--ws-fg)); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin {
  to { transform: rotate(360deg); }
}
.login-page { display: grid; min-height: 100dvh; place-items: center; padding: 25px; background: radial-gradient(circle at 50% 10%,color-mix(in srgb, var(--ws-accent) 20%, transparent),transparent 30rem),var(--ws-surface-0); }
.login-card { max-width: 430px; text-align: center; }
.admin-brand.centered { justify-content: center; }
.login-card header { margin: 30px 0 24px; }
.language-link { margin-top: 20px; }
.center-card { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; color: var(--ws-fg-muted); }
.admin-shell { display: grid; min-height: 100dvh; grid-template-columns: 236px minmax(0,1fr); }
.admin-sidebar { position: sticky; top: 0; display: flex; height: 100dvh; flex-direction: column; padding: 26px 18px; background: var(--ws-surface-1); color: var(--ws-fg); border-right: 1px solid var(--ws-line); }
.admin-sidebar .admin-brand { padding: 0 8px 28px; }
.admin-sidebar nav { display: grid; gap: 6px; }
.admin-sidebar nav a { display: flex; align-items: center; gap: 10px; padding: 11px 12px; color: var(--ws-fg-muted); text-decoration: none; background: transparent; border: 0; border-radius: 9px; font-size: 12px; font-weight: 700; cursor: pointer; }
.admin-sidebar nav a.active { color: var(--ws-accent); background: var(--ws-accent-soft); }
.sidebar-bottom { display: grid; gap: 4px; margin-top: auto; padding-top: 20px; border-top: 1px solid var(--ws-line); }
.admin-main { min-width: 0; }
.admin-topbar { display: flex; align-items: center; justify-content: space-between; min-height: 82px; padding: 0 clamp(24px,4vw,58px); background: var(--ws-surface-1); border-bottom: 1px solid var(--ws-line); }
.admin-topbar small, .admin-topbar h1 { display: block; margin: 0; }
.admin-topbar small { color: var(--ws-fg-muted); font-size: 10px; text-transform: uppercase; }
.admin-topbar h1 { margin-top: 4px; font-size: 21px; font-weight: 700; }
.admin-topbar>div:last-child { display: flex; align-items: center; gap: 8px; color: var(--ws-fg-muted); font-size: 11px; }
.page-content { width: min(1180px,calc(100% - 48px)); margin: 0 auto; padding: 40px 0 70px; }
.page-alert { margin: 20px 24px 0; }
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.page-heading h2 { margin: 0; font-size: 25px; font-weight: 700; }
.page-heading p { margin: 7px 0 0; color: var(--ws-fg-muted); font-size: 12px; }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.settings-card, .readonly-card, .overview-card { padding: 24px; background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 14px; }
.settings-card { display: grid; align-content: start; gap: 18px; }
.settings-card h3, .readonly-card h3, .overview-card h3 { margin: 0; font-size: 15px; font-weight: 700; }
.password-row { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 9px; }
.readonly-card { margin-top: 20px; }
.readonly-card dl, .overview-card dl { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin: 18px 0 0; }
.readonly-card dl div, .overview-card dl div { padding: 13px; background: var(--ws-surface-0); border-radius: 9px; }
.readonly-card dt, .overview-card dt { color: var(--ws-fg-muted); font-size: 10px; }
.readonly-card dd, .overview-card dd { margin: 5px 0 0; font-size: 12px; font-weight: 700; }
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
  .admin-shell { display: block; }
  .admin-sidebar { position: static; width: 100%; height: auto; flex-direction: row; align-items: center; padding: 12px 16px; border-right: 0; border-bottom: 1px solid var(--ws-line); }
  .admin-sidebar .admin-brand { padding: 0; }
  .admin-sidebar .admin-brand small { display: none; }
  .admin-sidebar nav { display: flex; margin-left: auto; }
  .admin-sidebar nav a { font-size: 0; }
  .admin-sidebar nav a .ui-icon { width: 20px; height: 20px; }
  .sidebar-bottom { display: flex; margin: 0 0 0 8px; padding: 0; border: 0; }
  .settings-grid, .overview-columns { grid-template-columns: 1fr; }
  .readonly-card dl { grid-template-columns: 1fr 1fr; }
  .admin-topbar { padding: 0 18px; }
  .page-content { width: min(100% - 28px,700px); padding-top: 24px; }
  .metric-grid { grid-template-columns: 1fr; }
  .hero-status { align-items: flex-start; gap: 20px; }
  .hero-status p { max-width: 75%; }
}
@media (max-width: 520px) {
  .login-card { padding: 25px 20px; border-radius: 15px; }
  .admin-topbar>div:last-child { font-size: 0; }
  .page-heading { gap: 15px; }
  .settings-card, .readonly-card, .overview-card { padding: 18px; }
  .readonly-card dl, .overview-card dl { grid-template-columns: 1fr; }
  .password-row { grid-template-columns: 1fr; }
  .hero-status { padding: 23px; }
  }
 .security-note{margin:18px 0 0;color:var(--ws-fg-muted);font-size:11px;line-height:1.5}
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
.target-fields{display:grid;grid-template-columns:minmax(0,1fr) 132px;gap:12px}
@media(max-width:520px){.target-fields{grid-template-columns:1fr}}

/* Keep administration inside the browser viewport. Long data sets scroll in
   their own cards instead of pushing the whole page below the fold. */
.admin-shell{height:100dvh;min-height:100dvh;overflow:hidden}
.admin-main{min-height:0;display:flex;flex-direction:column;overflow:hidden}
.admin-topbar{flex:0 0 auto}
.page-content{flex:1 1 auto;min-height:0;overflow-y:auto}
.operations-page{display:flex;flex-direction:column;width:min(1400px,calc(100% - 48px));height:calc(100dvh - 82px);overflow:hidden;padding-top:28px;padding-bottom:18px}
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
  .admin-main{height:100%}
  .operations-page{width:min(100% - 28px,700px);height:auto;min-height:calc(100dvh - 82px);overflow:visible}
  .operations-page .lower-operations{flex:none}
}

/* Keep every admin surface inside the viewport. The page content and data
   lists are the scroll containers, never the document body. */
:global(html),:global(body),:global(#app){width:100%;height:100dvh;min-height:0;max-height:100dvh;overflow:hidden}
.admin-root{height:100dvh;min-height:0;overflow:hidden}
.login-page{height:100dvh;min-height:0;overflow:hidden}
.login-card{max-height:calc(100dvh - 50px);overflow-y:auto}

@media(max-width:850px){
  .admin-shell{display:flex;flex-direction:column}
  .admin-main{height:auto;flex:1 1 auto}
}

/* Keep static admin cards at their own height. Only long data collections
   become scroll surfaces, so a busy event feed cannot stretch its neighbour
   or turn the whole admin view into a second page. */
.admin-main>.page-alert{flex:0 0 auto}
.page-content{display:flex;flex:1 1 auto;min-height:0;flex-direction:column;overflow:hidden}
.overview-page{padding:28px 0 18px}
.overview-page .import-notice{flex:0 0 auto;margin-top:0;margin-bottom:12px}
.overview-page .hero-status{flex:0 0 auto;padding:24px}
.overview-page .metric-grid{flex:0 0 auto;gap:12px;margin:14px 0}
.overview-page .metric-grid article{padding:18px}
.overview-page .overview-columns{flex:1 1 0;min-height:0;align-items:stretch;gap:14px}
.target-health-card{align-self:start}
.recent-events-card{display:flex;height:100%;min-height:0;flex-direction:column;overflow:hidden}
.recent-events-card .event-list{flex:1 1 auto;min-height:0;max-height:none;overflow-y:auto}
.server-page{padding:28px 0 18px}
.server-page .page-heading{flex:0 0 auto;margin-bottom:14px}
.server-page .settings-grid{flex:1 1 auto;min-height:0;align-items:stretch;gap:14px}
.server-page .settings-card{min-height:0;overflow-y:auto;padding:20px}
.server-page .readonly-card{flex:0 0 auto;margin-top:14px;padding:16px 20px}
.server-page .readonly-card dl{gap:10px;margin-top:12px}
.operations-page{height:auto;min-height:0}
.operations-primary{flex:0 0 250px}
.operations-primary>.operation-card{overflow-y:auto}
.operations-primary>.operation-card{padding:14px 16px}
.operations-primary .operation-card header p{line-height:1.3}
.operations-primary .invite-form{gap:6px;margin-top:8px}
.operations-primary .field-help{margin-top:-4px}

/* Theme all native scrollbars used by the admin surfaces. */
:global(*){scrollbar-color:var(--ws-line-strong) transparent;scrollbar-width:thin}
:global(*::-webkit-scrollbar){width:8px;height:8px}
:global(*::-webkit-scrollbar-track){background:transparent}
:global(*::-webkit-scrollbar-thumb){background:var(--ws-line-strong);background-clip:padding-box;border:2px solid transparent;border-radius:999px}
:global(*::-webkit-scrollbar-thumb:hover){background:var(--ws-fg-muted);background-clip:padding-box;border-width:1px}

@media(max-width:850px){
  .page-content{width:min(100% - 28px,700px);padding-top:20px;padding-bottom:14px}
  .page-heading{flex-wrap:wrap}
  .overview-page .hero-status{padding:18px}
  .overview-page .hero-status h2{font-size:24px}
  .overview-page .metric-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}
  .overview-page .metric-grid article{padding:12px}
  .overview-page .metric-grid .metric-icon{top:10px;right:10px;width:28px;height:28px}
  .overview-page .metric-grid strong{margin-top:9px;font-size:15px}
  .overview-page .overview-columns{grid-template-rows:minmax(0,1fr) minmax(0,1fr);overflow:hidden}
  .overview-page .target-health-card{align-self:stretch;min-height:0;overflow-y:auto}
  .overview-page .recent-events-card{height:100%}
  .server-page .settings-grid{grid-template-columns:1fr;grid-auto-rows:minmax(190px,1fr);overflow-y:auto}
  .server-page .readonly-card dl{grid-template-columns:repeat(2,minmax(0,1fr))}
  .operations-page{height:100%;overflow:hidden}
  .operations-page .operations-primary,.operations-page .lower-operations{grid-template-columns:1fr;min-height:0;overflow-y:auto;align-content:start}
  .operations-page .operations-primary{grid-auto-rows:240px}
  .operations-page .lower-operations{grid-auto-rows:190px}
  .operations-page .lower-operations{flex:1 1 0}
}
.advanced-card{grid-column:1 / -1}
.advanced-card .card-help{margin:5px 0 0;color:var(--ws-fg-muted);font-size:10px;line-height:1.5}
.relay-card{grid-column:1 / -1}
.relay-card .card-help{margin:5px 0 0;color:var(--ws-fg-muted);font-size:10px;line-height:1.5}
.relay-node-list{display:grid;gap:10px}
.relay-node{display:grid;gap:10px;padding:12px;background:var(--ws-surface-0);border:1px solid var(--ws-line);border-radius:10px}
.relay-node-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
.relay-empty{padding:10px 12px;color:var(--ws-fg-muted);background:var(--ws-surface-0);border:1px dashed var(--ws-line);border-radius:9px;font-size:11px}
.relay-add{justify-self:start;min-height:34px;padding-inline:13px}
.relay-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.relay-fields .password-row{grid-column:1 / -1}
.relay-card .field-help{line-height:1.55}
.welcome-editor{display:grid;gap:10px;padding:12px;background:var(--ws-surface-0);border:1px solid var(--ws-line);border-radius:10px}
.welcome-editor-heading{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,1fr);align-items:end;gap:12px}
.welcome-editor-heading>small{margin:0;color:var(--ws-fg-muted);font-size:10px;line-height:1.5}
.webrtc-port-fields{display:grid;gap:10px;padding:14px;background:var(--ws-surface-0);border:1px solid var(--ws-line);border-radius:10px}
.port-fields-heading strong,.port-fields-heading small{display:block}
.port-fields-heading strong{font-size:11px}
.port-fields-heading small{margin-top:4px;color:var(--ws-fg-muted);font-size:10px;line-height:1.45}
.port-inputs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:850px){.relay-card{grid-column:auto}.relay-fields{grid-template-columns:1fr}.relay-fields .password-row{grid-column:auto}}
@media(max-width:520px){.advanced-card{grid-column:auto}.port-inputs{grid-template-columns:1fr}}
@media(max-width:520px){.welcome-editor-heading{grid-template-columns:1fr;gap:6px}}

/* Server settings are a short form, not a set of independent data feeds.
   Let each card keep its natural height so a few extra pixels do not create
   three nested scrollbars. The section itself is the only fallback scroll
   surface when a small viewport cannot show the complete form. */
.server-page{overflow-x:hidden;overflow-y:auto}
.server-page .settings-grid{flex:0 0 auto;min-height:auto;align-items:start;overflow:visible;grid-auto-rows:auto}
.server-page .settings-card{height:auto;min-height:0;overflow:visible;padding:16px;gap:12px}
.server-page .settings-card input{height:40px}
.server-page .webrtc-port-fields{padding:12px;gap:8px}
.server-page .readonly-card{margin-top:12px;padding:14px 16px}
.server-page .readonly-card dl{gap:8px;margin-top:10px}

@media(max-width:850px){
  .server-page .settings-grid{overflow:visible;grid-auto-rows:auto}
  .server-page .settings-card{overflow:visible}
}

/* Mobile admin pages should read like one continuous form. Keep the desktop
   viewport shell untouched, but let the document grow vertically on narrow
   screens instead of trapping content inside cards and nested panes. */
@media(max-width:850px){
  :global(html),:global(body),:global(#app){height:auto;min-height:100%;max-height:none;overflow:auto}
  .admin-root{height:auto;min-height:100dvh;overflow:visible}
  .admin-shell{height:auto;min-height:100dvh;overflow:visible}
  .admin-main{height:auto;min-height:0;overflow:visible}
  .page-content{display:block;height:auto;min-height:0;overflow:visible}
  .login-page{height:auto;min-height:100dvh;overflow:visible}
  .login-card{max-height:none;overflow:visible}

  .overview-page{height:auto;min-height:0;overflow:visible}
  .overview-page .overview-columns{grid-template-rows:auto;overflow:visible}
  .overview-page .target-health-card,.overview-page .recent-events-card{height:auto;min-height:0;overflow:visible}
  .overview-page .recent-events-card .event-list{max-height:none;overflow:visible}

  .server-page{height:auto;min-height:0;overflow:visible}
  .server-page .settings-grid{height:auto;overflow:visible}

  .operations-page{height:auto;min-height:0;overflow:visible}
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

.login-actions{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:20px;flex-wrap:wrap}
.login-actions .language-link{margin-top:0}
.home-link{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;color:var(--ws-accent);background:var(--ws-accent-soft);border:1px solid var(--ws-line);border-radius:8px;font-size:11px;font-weight:700;text-decoration:none}
.home-link:hover{background:var(--ws-accent-soft)}
.language-link{margin-top:20px!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important}
.login-actions .language-link{margin-top:0!important}

/* Desktop server settings must keep their own scroll surface. The admin shell
   is viewport-locked, so an unconstrained flex item can otherwise push the
   relay card below the clipped page-content area. */
.settings-card,.relay-card,.relay-node,.relay-fields,.relay-node-heading,.password-row{min-width:0}

@media(min-width:851px){
  .server-page{flex:1 1 auto;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto}
  .server-page .settings-grid{min-width:0}
  .settings-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .relay-fields{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
}

/* The application is zoomed up on large displays so the 1920×1080 layout
   stays readable. Compensate viewport heights for that zoom; otherwise a
   2K viewport becomes a 1920px-tall admin shell and clips its lower cards. */
@media(min-width:851px){
  :global(html),:global(body){height:100dvh;max-height:100dvh}
  :global(#app),.admin-root,.admin-shell,.admin-sidebar{height:calc(100dvh / var(--ui-scale));min-height:calc(100dvh / var(--ui-scale));max-height:calc(100dvh / var(--ui-scale))}
  .admin-main{height:100%;min-height:0}
}
</style>
