<template>
  <section
    class="flex h-dvh min-h-0 flex-col overflow-hidden bg-surface-0 text-fg motion-reduce:**:animate-none motion-reduce:**:transition-none max-compact:h-svh max-compact:max-h-svh max-compact:min-h-svh desktop:h-[calc(100dvh/var(--ui-scale))] desktop:max-h-[calc(100dvh/var(--ui-scale))]"
  >
    <JoinHeader
      class="relative z-10 mx-auto flex min-h-18 w-[min(1240px,calc(100%-64px))] animate-join-fade-up items-center justify-between max-compact:min-h-[calc(62px+env(safe-area-inset-top,0px))] max-compact:w-[min(100%-28px,560px)] max-compact:pt-[env(safe-area-inset-top,0px)] max-phone-lg:w-[calc(100%-20px)] max-phone-lg:gap-1.5"
      :site-name="siteName"
      :app-version="appVersion"
      :theme-icon="themeIcon"
      :theme-label="themeLabel"
      @cycle-theme="cycleTheme"
      @language-change="persistLanguage"
    />

    <main
      class="relative z-1 mx-auto grid min-h-0 w-[min(1240px,calc(100%-64px))] flex-1 grid-cols-[minmax(0,1fr)_minmax(480px,520px)] items-center gap-[clamp(40px,6vw,88px)] overflow-y-auto pt-7 pb-9 max-medium:gap-10 max-compact:flex max-compact:w-[min(100%-28px,560px)] max-compact:flex-col max-compact:items-stretch max-compact:justify-start max-compact:gap-6 max-compact:pt-6 max-compact:pb-7 max-phone:gap-4.5"
    >
      <JoinHero :welcome-text="localizedWelcomeText" :visitor-number="visitorNumber" :visitor-total="visitorTotal" />

      <JoinForm
        v-model:server-id="serverId"
        v-model:server-host="serverHost"
        v-model:server-port="serverPort"
        v-model:server-password="serverPassword"
        v-model:acceleration-relay-id="accelerationRelayId"
        v-model:nickname="nickname"
        v-model:channel="channel"
        :access-mode="accessMode"
        :servers="servers"
        :favorite-servers="favoriteServers"
        :recent-servers="recentServers"
        :is-favorite="isFavorite"
        :acceleration-available="accelerationAvailable"
        :acceleration-relays="accelerationRelays"
        :initialized="initialized"
        :server-config-loading="serverConfigLoading"
        :server-config-failed="serverConfigFailed"
        :gateway-status="gatewayStatus"
        :gateway-retry-in="gatewayRetryIn"
        :browser-error="browserError"
        :error="voiceState.error"
        :error-code="voiceState.errorCode"
        :identity-ready="identityReady"
        :identity-manager="identityManager"
        :identity-target="identityTarget"
        :can-join="canJoin"
        :connecting="voiceState.connecting"
        @select-local-server="selectLocalServer"
        @toggle-favorite="toggleFavorite"
        @connect="doConnect"
        @disconnect="doDisconnect"
        @retry-config="loadPublicConfig"
      />
    </main>

    <JoinFooter class="animate-join-fade-up-late" :app-version="appVersion" @clear-local-data="clearBrowserData" />
  </section>

  <!-- TeamSpeak server password modal -->
  <PasswordDialog
    v-model:password="serverPasswordDialog.password"
    :open="serverPasswordDialog.open"
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
import { computed } from "vue";
import PasswordDialog from "@/shared/components/PasswordDialog.vue";
import { useAppearance } from "@/shared/composables/useAppearance";
import { useI18n } from "@/shared/i18n/useI18n";
import { JoinFooter, JoinForm, JoinHeader, JoinHero, useJoinForm, useJoinIdentity, useJoinScreen } from "@/features/join";
import { useIdentityManager } from "@/features/identity";
import { useRoomContext } from "@/features/room";

const room = useRoomContext();
const { state: voiceState, identityMaterial, connect, disconnect, clearError } = room.session;
const { checkSupport } = room.audio;

const { t } = useI18n();
const { themeIcon, themeLabel, cycleTheme, persistLanguage, setThemeMode } = useAppearance();
const identityManager = useIdentityManager();
const {
  nickname,
  channel,
  serverHost,
  serverPort,
  serverPassword,
  serverId,
  servers,
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
  serverConfigFailed,
  gatewayStatus,
  gatewayRetryIn,
  loadPublicConfig,
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
  selectedIdentityId: identityManager.selectedId,
  connect,
  disconnect,
  clearError,
  checkSupport,
  setThemeMode,
});
const { identityReady } = useJoinIdentity({ manager: identityManager, identityMaterial, rememberIdentity });
useJoinScreen({ voiceState, serverPasswordDialog, clearError });

const identityTarget = computed(() =>
  accessMode.value === "open" && !serverId.value && serverHost.value.trim() ? `${serverHost.value.trim()}:${serverPort.value.trim()}` : "",
);
</script>
