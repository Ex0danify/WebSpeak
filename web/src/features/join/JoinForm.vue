<template>
  <div class="join-card">
    <h2>{{ t('welcomeBack') }}</h2>
    <p class="card-lead">{{ t('joinLead') }}</p>

    <div v-if="error" class="notice error-notice"><span class="notice-symbol">!</span><span class="notice-content"><span>{{ resolveText(error) }}</span><code v-if="errorCode">{{ t('errorCode') }}: {{ visibleErrorCode(errorCode) }}</code></span></div>
    <div v-if="browserError" class="notice warning-notice"><span class="notice-symbol">{{ NOTICE_GLYPH }}</span><span>{{ resolveText(browserError) }}</span></div>
    <div v-if="!serverConfigLoading && !initialized" class="notice warning-notice"><span class="notice-symbol">{{ NOTICE_GLYPH }}</span><span>{{ t('notConfigured') }} <a href="/admin">{{ t('configureNow') }}</a></span></div>
    <div v-if="!localPersistenceAvailable" class="notice warning-notice"><span class="notice-symbol">{{ NOTICE_GLYPH }}</span><span>{{ t('localPersistenceUnavailable') }}</span></div>

    <form v-if="initialized" class="join-form" @submit.prevent="$emit('connect')">
      <div v-if="accessMode === 'open'" class="field-grid target-fields">
        <Field id="server-address" :label="t('serverAddress')"><Input v-model="serverHost" autocomplete="url" :placeholder="t('serverAddressPlaceholder')"><template #leading><Icon name="server" /></template></Input></Field>
        <Field id="server-port" :label="t('serverPort')"><Input v-model="serverPort" inputmode="numeric" type="text" maxlength="5" :placeholder="t('serverPortPlaceholder')"><template #leading><Icon name="hash" /></template></Input></Field>
      </div>
      <div v-if="accelerationAvailable" class="acceleration-choice"><div class="acceleration-copy"><strong>{{ t('relayAcceleration') }}</strong><small>{{ t('relayAccelerationHint') }}</small></div><Select v-model="accelerationRelayId" class="min-w-[150px] max-w-[48%]" :aria-label="t('relayAcceleration')"><option value="">{{ t('directConnection') }}</option><option v-for="relay in accelerationRelays" :key="relay.id" :value="relay.id">{{ relay.name }}</option></Select></div>
      <div v-if="accessMode === 'open' && (favoriteServers.length || recentServers.length)" class="local-servers">
        <div v-if="favoriteServers.length" class="local-server-group"><span>{{ t('favoriteServers') }}</span><Button v-for="favorite in favoriteServers" :key="favorite.id" variant="outline" size="sm" class="text-accent" @click="$emit('select-local-server', favorite.address, favorite.nickname)">{{ favorite.label }}</Button></div>
        <div v-if="recentServers.length" class="local-server-group"><span>{{ t('recentServers') }}</span><Button v-for="recent in recentServers" :key="recent.id" variant="outline" size="sm" class="text-accent" @click="$emit('select-local-server', recent.address, recent.nickname)">{{ recent.address }}</Button></div>
      </div>
      <Button v-if="accessMode === 'open' && serverHost.trim()" variant="outline" size="sm" class="justify-self-start text-accent" @click="$emit('toggle-favorite')">{{ isFavorite ? t('removeFavorite') : t('saveFavorite') }}</Button>

      <Field v-if="accessMode === 'open'" id="server-password" class="mt-1.5">
        <template #label>{{ t('serverPassword') }} <span class="font-normal text-fg-muted">{{ t('optional') }}</span></template>
        <Input v-model="serverPassword" type="password" autocomplete="off" :placeholder="t('optionalPassword')"><template #leading><Icon name="lock" /></template></Input>
      </Field>

      <Field id="nickname" :label="t('nickname')" class="mt-1.5">
        <Input v-model="nickname" autocomplete="nickname" maxlength="30" :placeholder="t('nicknamePlaceholder')" autofocus><template #leading><Icon name="users" /></template></Input>
      </Field>

      <Field id="channel" class="mt-1.5">
        <template #label>{{ t('targetChannel') }} <span class="font-normal text-fg-muted">{{ t('optional') }}</span></template>
        <Input v-model="channel" :placeholder="t('emptyDefault')" @keyup.enter="$emit('connect')"><template #leading><Icon name="hash" /></template></Input>
      </Field>

      <details class="identity-options"><summary>{{ t('identityOptions') }}</summary><Checkbox v-model="rememberIdentity" class="remember-identity"><strong>{{ t('rememberIdentity') }}</strong><small>{{ t('rememberIdentityHint') }}</small></Checkbox></details><p v-if="rememberIdentity" class="identity-warning">{{ t('rememberIdentityConcurrentWarning') }}</p>

      <Button type="submit" size="lg" class="mt-2.5 w-full" :loading="connecting" :disabled="!canJoin || serverConfigLoading || !identityReady || connecting">
        <span>{{ connecting ? t('connecting') : t('enterVoice') }}</span>
        <Icon v-if="!connecting" name="chevron-right" />
      </Button>
      <Button v-if="connecting" variant="ghost" size="sm" class="justify-self-center text-fg-muted hover:text-accent" @click="$emit('disconnect')">{{ t('cancel') }}</Button>
    </form>
    <div class="join-meta"><Icon name="lock" :size="14" /> {{ t('connectionAuthorized') }}</div>
  </div>
</template>

<script setup lang="ts">
import { NOTICE_GLYPH } from "@/shared/lib/brand";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { visibleErrorCode } from "@/features/session";
import { resolveText, type MaybeLocalizedText } from "@/shared/i18n/localizedText.js";
import { isLocalPersistenceAvailable } from "@/shared/services/localPersistence.js";
import type { FavoriteServer, RecentServer } from "@/shared/services/localPersistence.js";

defineProps<{
  accessMode: "fixed" | "open";
  favoriteServers: FavoriteServer[];
  recentServers: RecentServer[];
  isFavorite: boolean;
  accelerationAvailable: boolean;
  accelerationRelays: Array<{ id: string; name: string }>;
  initialized: boolean;
  serverConfigLoading: boolean;
  browserError: MaybeLocalizedText;
  error: MaybeLocalizedText;
  errorCode: string;
  identityReady: boolean;
  canJoin: boolean;
  connecting: boolean;
}>();

defineEmits<{
  (e: "select-local-server", address: string, nickname?: string): void;
  (e: "toggle-favorite"): void;
  (e: "connect"): void;
  (e: "disconnect"): void;
}>();

const serverHost = defineModel<string>("serverHost", { default: "" });
const serverPort = defineModel<string>("serverPort", { default: "" });
const serverPassword = defineModel<string>("serverPassword", { default: "" });
const accelerationRelayId = defineModel<string>("accelerationRelayId", { default: "" });
const nickname = defineModel<string>("nickname", { default: "" });
const channel = defineModel<string>("channel", { default: "" });
const rememberIdentity = defineModel<boolean>("rememberIdentity", { default: false });

const { t } = useI18n();
const localPersistenceAvailable = isLocalPersistenceAvailable();
</script>

<style scoped>
.join-card { padding: 30px; border: 1px solid color-mix(in srgb, var(--ws-line) 80%, transparent); border-radius: 20px; background: color-mix(in srgb, var(--ws-surface-1) 86%, transparent); box-shadow: var(--shadow-sm); backdrop-filter: blur(12px); }
.join-card h2 { margin: 10px 0 7px; color: var(--ws-fg); font-size: 27px; font-weight: 700; letter-spacing: -.045em; }
.card-lead { margin: 0 0 7px; color: var(--ws-fg-muted); font-size: 13px; }
.notice { display: flex; align-items: flex-start; gap: 10px; min-width: 0; margin: 0 0 10px; padding: 9px 10px; border-radius: 10px; font-size: 12px; line-height: 1.45; }
.notice-content { min-width: 0; overflow-wrap: anywhere; }
.notice-content code { display: block; max-width: 100%; margin-top: 3px; overflow: hidden; color: currentColor; font-family: ui-monospace,SFMono-Regular,Consolas,monospace; font-size: 10px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; opacity: .78; }
.error-notice { color: var(--ws-danger); background: var(--ws-danger-soft); border: 1px solid color-mix(in srgb, var(--ws-danger) 30%, var(--ws-surface-1)); }
.warning-notice { color: var(--ws-warning); background: var(--ws-warning-soft); border: 1px solid color-mix(in srgb, var(--ws-warning) 30%, var(--ws-surface-1)); }
.notice-symbol { display: grid; place-items: center; width: 16px; height: 16px; flex: 0 0 auto; border-radius: 50%; color: var(--ws-accent-fg); background: currentColor; color: var(--ws-accent-fg); font-size: 10px; font-weight: 800; }
.error-notice .notice-symbol { background: var(--ws-danger); }
.warning-notice .notice-symbol { background: var(--ws-warning); }
.join-form { display: grid; gap: 6px; }
.field-grid { display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 12px; }
.join-meta { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 12px; color: var(--ws-fg-muted); font-size: 10px; }

.identity-options { margin-top: 8px; color: var(--ws-fg-muted); font-size: 11px; }
.identity-options summary { width: fit-content; color: var(--ws-accent); cursor: pointer; }
.identity-options[open] summary { margin-bottom: 10px; }
/* Touch target floor: pad the hit box out to 44px tall with a matching negative margin, so the
   disclosure's own footprint (and the gap above the checkbox row it reveals) stays put. */
@media (max-width: 740px) {
  .identity-options summary { margin-block: -15px; padding-block: 15px; }
}
.remember-identity { display: flex; align-items: flex-start; gap: 9px; margin-top: 8px; color: var(--ws-fg); cursor: pointer; }
.acceleration-choice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 2px; padding: 10px 11px; color: var(--ws-accent); background: var(--ws-surface-0); border: 1px solid var(--ws-line); border-radius: 10px; }
.acceleration-copy { min-width: 0; }
.acceleration-choice strong, .acceleration-choice small { display: block; }
.acceleration-choice strong { font-size: 11px; font-weight: 800; }
.acceleration-choice small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 10px; line-height: 1.45; }
.remember-identity strong, .remember-identity small { display: block; }
.remember-identity strong { font-size: 11px; font-weight: 700; }
.remember-identity small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 10px; line-height: 1.4; }
.identity-warning { margin: 8px 0 0; color: var(--ws-warning); font-size: 10px; line-height: 1.45; }
.local-servers { display: grid; gap: 8px; margin: 1px 0 5px; }
.local-server-group { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.local-server-group > span { width: 100%; color: var(--ws-fg-muted); font-size: 10px; font-weight: 700; }

.join-page .join-card { animation: join-fade-up .68s .24s cubic-bezier(.22, 1, .36, 1) both; }

@media (max-width: 980px) { .join-card { padding: 28px; } }
@media (max-width: 740px) { .join-card { padding: 24px 20px; } }
@media (max-width: 420px) { .join-card { border-radius: 15px; } }

.join-page .join-card h2 { font-size: 33.75px; }
.join-page .card-lead { font-size: 16.25px; }
.join-page .notice { font-size: 15px; }
.join-page .join-meta { font-size: 12.5px; }

.join-page .join-card { position: relative; }
.join-card { background: color-mix(in srgb, var(--ws-surface-1) 92%, transparent); border-color: var(--ws-line); }
.join-card h2 { color: var(--ws-fg); }
.card-lead { color: var(--ws-fg-muted); }

@media (min-width: 741px) {
  .join-card { max-height: calc(100dvh - 190px); overflow-y: auto; }
}
@media (max-width: 740px) {
  .join-card { max-height: none; overflow: visible; }
}

@media (max-width: 740px) {
  .join-card { padding: 22px 18px; border-radius: 18px; }
  .join-card h2 { font-size: 25px; }
  .field-grid { grid-template-columns: minmax(0, 1fr) 112px; }
}
@media (max-width: 390px) {
  .join-card { padding-inline: 15px; }
}

/* Latin-script translations need a little more room than Chinese copy (this
   component's share of that rule). */
:root[lang="en"] .join-card h2,
:root[lang="de"] .join-card h2 { font-size: 29.7px; }
:root[lang="en"] .card-lead,
:root[lang="de"] .card-lead { font-size: 14.3px; }
:root[lang="en"] .notice,
:root[lang="de"] .notice { font-size: 13.2px; }
:root[lang="en"] .join-meta,
:root[lang="de"] .join-meta { font-size: 11px; }

@media (max-width: 740px) {
  :root[lang="en"] .join-card h2,
  :root[lang="de"] .join-card h2 { font-size: 22px; }
  :root[lang="en"] .card-lead,
  :root[lang="de"] .card-lead { font-size: 13px; }
}
</style>
