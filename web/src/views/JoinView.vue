<template>
  <section class="join-page">
    <JoinHeader
      :site-name="siteName"
      :app-version="appVersion"
      :theme-icon="themeIcon"
      :theme-label="themeLabel"
      @qq-open="qqModalOpen = true"
      @cycle-theme="cycleTheme"
      @language-change="persistLanguage"
    />

    <main class="join-content">
      <JoinHero
        :welcome-text="localizedWelcomeText"
        :visitor-number="visitorNumber"
        :visitor-total="visitorTotal"
      />

      <JoinForm
        v-model:server-host="serverHost"
        v-model:server-port="serverPort"
        v-model:server-password="serverPassword"
        v-model:acceleration-relay-id="accelerationRelayId"
        v-model:nickname="nickname"
        v-model:channel="channel"
        v-model:remember-identity="rememberIdentity"
        :access-mode="accessMode"
        :favorite-servers="favoriteServers"
        :recent-servers="recentServers"
        :is-favorite="isFavorite"
        :acceleration-available="accelerationAvailable"
        :acceleration-relays="accelerationRelays"
        :initialized="initialized"
        :server-config-loading="serverConfigLoading"
        :browser-error="browserError"
        :error="voiceState.error"
        :error-code="voiceState.errorCode"
        :identity-ready="identityReady"
        :can-join="canJoin"
        :connecting="voiceState.connecting"
        @select-local-server="selectLocalServer"
        @toggle-favorite="toggleFavorite"
        @connect="doConnect"
        @disconnect="doDisconnect"
      />
    </main>

    <JoinFooter @clear-local-data="clearBrowserData" />

    <QqDialog v-model="qqModalOpen" />
  </section>

  <!-- TeamSpeak server password modal -->
  <PasswordDialog
    :open="serverPasswordDialog.open"
    v-model:password="serverPasswordDialog.password"
    :title="t('serverPasswordTitle')"
    :lead="serverPasswordDialog.errorCode === 'INVALID_SERVER_PASSWORD' ? t('serverPasswordInvalidLead') : t('serverPasswordRequiredLead')"
    :label="t('serverPasswordPrompt')"
    :placeholder="t('serverPasswordRetryPlaceholder')"
    :submit-label="t('serverPasswordRetry')"
    :cancel-label="t('channelPasswordCancel')"
    :close-label="t('close')"
    @submit="submitServerPassword"
    @cancel="cancelServerPassword"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";
import PasswordDialog from "@/shared/components/PasswordDialog.vue";
import { useAppearance } from "@/shared/composables/useAppearance";
import { useI18n } from "@/shared/i18n/useI18n";
import { JoinFooter, JoinForm, JoinHeader, JoinHero, QqDialog, useJoinForm, useJoinIdentity, useJoinScreen } from "@/features/join";
import { useRoomContext } from "@/features/room";

const room = useRoomContext();
const {
  state: voiceState,
  identityMaterial,
  connect,
  disconnect,
  clearError,
} = room.session;
const { checkSupport } = room.audio;

const { t } = useI18n();
const { themeIcon, themeLabel, cycleTheme, persistLanguage, setThemeMode } = useAppearance();
const {
  nickname,
  channel,
  serverHost,
  serverPort,
  serverPassword,
  accessMode,
  rememberIdentity,
  favoriteServers,
  recentServers,
  initialized,
  siteName,
  localizedWelcomeText,
  appVersion,
  visitorNumber,
  visitorTotal,
  accelerationRelays,
  accelerationRelayId,
  accelerationAvailable,
  browserError,
  serverConfigLoading,
  serverPasswordDialog,
  canJoin,
  isFavorite,
  selectLocalServer,
  toggleFavorite,
  doConnect,
  doDisconnect,
  submitServerPassword,
  cancelServerPassword,
  clearBrowserData,
} = useJoinForm({
  voiceState,
  identityMaterial,
  connect,
  disconnect,
  clearError,
  checkSupport,
  setThemeMode,
});
const { identityReady } = useJoinIdentity({ identityMaterial, rememberIdentity });
const { qqModalOpen } = useJoinScreen({ voiceState, serverPasswordDialog, clearError });
</script>

<style scoped>
.join-page { min-height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: var(--ws-surface-0); }
.join-header, .join-content { width: min(1240px, calc(100% - 64px)); margin: 0 auto; }
.join-header, .join-content { position: relative; z-index: 1; }
.join-header { z-index: 10; }
.join-header { min-height: 84px; display: flex; align-items: center; justify-content: space-between; }
.language-switch { min-width: 50px; min-height: 28px; padding: 0 9px; color: var(--ws-accent); background: var(--ws-accent-soft); border: 1px solid var(--ws-line); border-radius: 7px; font-size: 10px; font-weight: 700; cursor: pointer; transition: .18s; }
.language-switch:hover { color: var(--ws-accent-fg); background: var(--ws-accent); border-color: var(--ws-accent); }
.join-content { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(480px, 520px); align-items: center; gap: clamp(40px, 6vw, 88px); padding: 38px 0 56px; }

@keyframes join-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes join-title-in { from { opacity: 0; letter-spacing: -.02em; transform: translateY(18px) scale(.98); } to { opacity: 1; letter-spacing: -.075em; transform: translateY(0) scale(1); } }
@keyframes join-accent-breathe { 0%, 100% { transform: translateY(0); text-shadow: 0 0 0 color-mix(in srgb, var(--ws-accent) 0%, transparent); } 50% { transform: translateY(-2px); text-shadow: 0 5px 18px color-mix(in srgb, var(--ws-accent) 16%, transparent); } }
@keyframes join-accent-breathe-dark { 0%, 100% { transform: translateY(0); text-shadow: 0 0 8px color-mix(in srgb, var(--ws-success) 28%, transparent), 0 0 18px color-mix(in srgb, var(--ws-accent) 14%, transparent); } 50% { transform: translateY(-2px); text-shadow: 0 0 13px color-mix(in srgb, var(--ws-success) 50%, transparent), 0 0 26px color-mix(in srgb, var(--ws-accent) 22%, transparent); } }
@keyframes join-dot-pulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in srgb, var(--ws-success) 28%, transparent); } 50% { transform: scale(1.18); box-shadow: 0 0 0 6px color-mix(in srgb, var(--ws-success) 0%, transparent); } }
.join-page .join-header { animation: join-fade-up .55s cubic-bezier(.22, 1, .36, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .join-page *, .join-page *::before, .join-page *::after { animation: none !important; transition-duration: .01ms !important; }
}

@media (max-width: 980px) { .join-content { gap: 40px; } }
@media (max-width: 740px) { .join-header, .join-content { width: min(100% - 32px, 560px); }.join-header { min-height: 70px; }.join-content { display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 35px; padding: 36px 0 48px; } }

.join-page .language-switch { font-size: 12.5px; }

.join-page { height: 100dvh; min-height: 0; overflow-y: auto; }

.join-page { background-color: var(--ws-surface-0); color: var(--ws-fg); }

/* Keep the desktop join card comfortable without making the welcome page
   taller than the browser. Smaller viewports can scroll inside the card. */
@media (min-width: 741px) {
  .join-header { min-height: 72px; }
  .join-content { padding: 28px 0 36px; }
}

.join-page { height: 100dvh; min-height: 0; overflow: hidden; }
.join-content { min-height: 0; overflow-y: auto; }

/* Desktop zoom compensation, see ClientLayout.vue. */
@media (min-width: 851px) {
  .join-page { height: calc(100dvh / var(--ui-scale)); min-height: 0; max-height: calc(100dvh / var(--ui-scale)); }
}

@media (max-width: 740px) {
  .join-content { overflow-y: auto; }
}

@media (max-width: 740px) {
  .join-page { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; }
  .join-header { min-height: calc(62px + env(safe-area-inset-top, 0px)); padding-top: env(safe-area-inset-top, 0px); box-sizing: border-box; }
  .join-content { align-items: stretch; justify-content: flex-start; gap: 24px; width: min(100% - 28px, 560px); padding: 24px 0 28px; overflow-y: auto; }
}

@media (max-width: 390px) {
  .join-content { gap: 18px; }
}

/* Keep every welcome-page action inside the viewport on narrow phones. */
@media (max-width: 420px) {
  .join-page .join-header { width: calc(100% - 20px); gap: 6px; }
  .join-page .language-switcher { min-width: 58px; }
}
</style>
