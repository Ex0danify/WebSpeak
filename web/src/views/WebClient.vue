<template>
  <div :class="['web-client', `language-${language}`]">
    <!-- Connection / welcome screen -->
    <section v-if="!voiceState.connected && !voiceState.reconnecting && !voiceState.reconnectFailed" class="join-page">
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

    <!-- Connected application shell -->
    <div v-else :class="['app-shell', `mobile-view-${mobileSection}`]">
      <main class="workspace">
        <h1 v-if="!isMobileViewport || (mobileSection !== 'channels' && mobileSection !== 'more')" class="sr-only">{{ t('voiceSpace') }}</h1>
        <WorkspaceHeader
          :current-channel-name="currentChannelName"
          :is-mobile-viewport="isMobileViewport"
          :microphone-muted="microphoneMuted"
          :theme-icon="themeIcon"
          :theme-label="themeLabel"
          @share="doShare"
          @toggle-microphone="toggleMicrophone"
          @open-settings="settingsOpen = true"
          @cycle-theme="cycleTheme"
          @language-change="persistLanguage"
          @disconnect="doDisconnect"
        >
          <template #network-performance>
            <NetworkPerformancePanel
              :performance-panel-open="performancePanelOpen"
              :performance-running="performanceRunning"
              :performance-stats="performanceStats"
              :screen-share-web-rtc-stats="screenShareWebRtcStats"
              @toggle-panel="togglePerformancePanel"
              @refresh="refreshPerformanceProbe"
            />
          </template>
        </WorkspaceHeader>

        <ScreenShareSettingsDialog
          v-model="screenShareSettingsOpen"
          v-model:resolution-preset="screenShareResolutionPreset"
          v-model:frame-rate="screenShareFrameRate"
          :resolution-options="screenShareResolutionOptions"
          :frame-rate-options="screenShareFrameRateOptions"
          @start="startScreenShareWithSettings"
        />

        <ReconnectBanner
          :reconnecting="voiceState.reconnecting"
          :reconnect-failed="voiceState.reconnectFailed"
          :reconnect-attempt="voiceState.reconnectAttempt"
          :error="voiceState.error"
          @reconnect-now="reconnectNow"
          @disconnect="doDisconnect"
        />
        <AudioNoticeBanner :audio-notice="voiceState.audioNotice" :audio-notice-code="voiceState.audioNoticeCode" />
        <PokeStack :pokes="pokeNotifications" @dismiss="dismissPoke" />

        <div class="workspace-scroll">
          <div class="workspace-content">
            <section :class="['voice-section', { 'mobile-section-hidden': mobileSection !== 'voice' }]">
              <VoiceHeading :count="currentMembers.length" />
              <ScreenShareInlineError v-if="screenShareError" :text="screenShareErrorText" />
              <ScreenSharePlayer
                :viewing="screenShareViewing"
                :remote-stream="screenShareRemoteStream"
                v-model:remote-volume="screenShareRemoteVolume"
                :error="screenShareError"
                :error-text="screenShareErrorText"
                :fullscreen="screenShareFullscreen"
                :viewer-count="screenSharePlayerViewerCount"
                :viewers="screenSharePlayerViewers"
                :owner-name="screenSharePlayerOwnerName"
                :viewer-style="screenShareViewerStyle"
                :set-video-element="setScreenVideoElement"
                :set-player-element="setScreenSharePlayerElement"
                @leave="leaveScreenShare"
                @toggle-fullscreen="toggleScreenShareFullscreen"
              />
              <VoiceGrid
                :current-members="currentMembers"
                :room-members="roomMembers"
                :speaking-ids="speakingIds"
                :is-mobile-viewport="isMobileViewport"
                :screen-share-stream-for-member="screenShareStreamForMember"
                :screen-share-active="screenShareActive"
                :screen-share-starting="screenShareStarting"
                :screen-share-viewing-stream-id="screenShareViewingStreamId"
                :screen-share-indicator-bars="screenShareIndicatorBars"
                v-model:screen-share-settings-open="screenShareSettingsOpen"
                @open-member-actions="openMemberActions"
                @stop-screen-share="stopScreenShare"
                @start-screen-share="startScreenShareWithSettings"
                @toggle-screen-share="toggleScreenShareForMember"
              />
              <WhisperStrip
                :whisper-target-ids="whisperTargetIds"
                :whisper-active="whisperActive"
                :whisper-ptt-active="whisperPttActive"
                :whisper-targets="whisperTargets"
                @clear-targets="clearWhisperTargets"
                @ptt-down="onWhisperPttDown"
                @ptt-up="onWhisperPttUp"
              />
              <MobileVoiceControls :microphone-muted="microphoneMuted" @toggle-microphone="toggleMicrophone" @open-settings="settingsOpen = true" />
            </section>

            <ChatPanel
              v-model:chat-tab="chatTab"
              v-model:message-draft="messageDraft"
              :mobile-section="mobileSection"
              :current-channel-name="currentChannelName"
              :private-conversations="privateConversations"
              :private-client-id="privateClientId"
              :chat-tab-label="chatTabLabel"
              :chat-title="chatTitle"
              :chat-placeholder="chatPlaceholder"
              :chat-panel-id="chatPanelId"
              :chat-tab-id="chatTabId"
              :active-chat-tab-id="activeChatTabId"
              :server-events="serverEvents"
              :visible-chat-messages="visibleChatMessages"
              :members="members"
              :event-text="eventText"
              :format-time="formatTime"
              :set-list-element="setChatListElement"
              @open-private-chat="openPrivateChat"
              @submit="submitMessage"
            />
          </div>
        </div>

      </main>

      <MemberPanel v-model:member-query="memberQuery" :mobile-section="mobileSection" :is-mobile-viewport="isMobileViewport" :away="away" :has-matches="filteredMemberChannels.length > 0" @toggle-away="toggleAway">
        <MemberTree
          :channels="filteredMemberChannels"
          :current-channel-id="currentChannel?.id"
          :drag-over-channel-id="dragOverChannelId"
          :dragged-member-id="draggedMember?.id"
          :speaking-ids="speakingIds"
          :volumes="volumes"
          :is-mobile-viewport="isMobileViewport"
          @select-channel="selectChannel"
          @channel-drag-over="onChannelDragOver"
          @channel-drag-leave="onChannelDragLeave"
          @channel-drop="onChannelDrop"
          @member-drag-start="onMemberDragStart"
          @member-drag-end="onMemberDragEnd"
          @member-pointer-down="onMemberPointerDown"
          @member-pointer-move="onMemberPointerMove"
          @member-pointer-up="onMemberPointerUp"
          @member-pointer-cancel="onMemberPointerCancel"
          @open-member-menu="openMemberMenu"
          @open-member-actions="openMemberActions"
          @set-volume="setVolume"
        />
        <template #footer>
        <DesktopAudioDock
          v-if="!isMobileViewport"
          :accompaniment-active="accompanimentActive"
          :microphone-muted="microphoneMuted"
          :input-volume="inputVolume"
          :noise-suppression-enabled="noiseSuppressionEnabled"
          :output-muted="outputMuted"
          :output-volume="outputVolume"
          @toggle-microphone="toggleMicrophone"
          @set-input-volume="setInputVolume"
          @set-noise-suppression="setNoiseSuppressionEnabled"
          @toggle-output-mute="toggleOutputMute"
          @set-output-volume="setOutputVolume"
          @open-settings="settingsOpen = true"
          @toggle-accompaniment="toggleAccompaniment"
        />
        </template>
      </MemberPanel>

      <MobileMorePanel
        v-if="mobileSection === 'more'"
        :microphone-muted="microphoneMuted"
        :theme-icon="themeIcon"
        :theme-label="themeLabel"
        @toggle-microphone="toggleMicrophone"
        @open-settings="settingsOpen = true"
        @cycle-theme="cycleTheme"
        @language-change="persistLanguage"
        @disconnect="doDisconnect"
      />

      <MobileNav v-model="mobileSection" />
    </div>

    <MemberContextMenu
      :member-menu="memberMenu"
      :member-menu-style="memberMenuStyle"
      :volumes="volumes"
      :whisper-target-ids="whisperTargetIds"
      :move-current-channel="memberMoveMenuCurrentChannel"
      :move-current-same-channel="memberMoveMenuCurrentSameChannel"
      :move-other-channels="memberMoveMenuOtherChannels"
      @close="memberMenu = null"
      @close-auto-focus="onMemberMenuCloseAutoFocus"
      @set-volume="setVolume"
      @private-message="openPrivateChat"
      @poke="pokeMember"
      @toggle-whisper="toggleWhisperTarget"
      @copy-name="copyMemberName"
      @move="moveMemberDirect"
    />

    <!-- Protected channel password modal -->
    <PasswordDialog
      :open="channelPasswordDialog.open"
      v-model:password="channelPasswordDialog.password"
      :title="t('channelPasswordTitle')"
      :lead="t('channelPasswordLead')"
      :label="t('channelPasswordPrompt')"
      :placeholder="t('channelPasswordPlaceholder')"
      :submit-label="t('channelPasswordSubmit')"
      :cancel-label="t('channelPasswordCancel')"
      :close-label="t('close')"
      :error="channelPasswordDialog.error"
      :submitting="channelPasswordDialog.submitting"
      @submit="submitChannelPassword"
      @cancel="cancelChannelPassword"
    />

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

    <AudioSettingsDialog
      v-model="settingsOpen"
      :audio-settings-error="audioSettingsError"
      :selected-input-device-id="selectedInputDeviceId"
      :input-devices="inputDevices"
      :audio-permission="audioPermission"
      :microphone-muted="microphoneMuted"
      :is-mobile-viewport="isMobileViewport"
      :noise-suppression-enabled="noiseSuppressionEnabled"
      :input-volume="inputVolume"
      :vox-threshold="voxThreshold"
      :mic-level="micLevel"
      :microphone-test-active="microphoneTestActive"
      :mic-meter-bars="micMeterBars"
      :meter-bar-height="meterBarHeight"
      :test-audio-url="testAudioUrl"
      :set-meter="setMicLevelMeter"
      :output-device-supported="outputDeviceSupported"
      :selected-output-device-id="selectedOutputDeviceId"
      :output-devices="outputDevices"
      :output-volume="outputVolume"
      :notification-volume="notificationVolume"
      :audio-status="audioStatus"
      :microphone-error="voiceState.microphoneError"
      @input-device-change="onInputDeviceChange"
      @toggle-microphone="toggleMicrophone"
      @set-noise-suppression="setNoiseSuppressionEnabled"
      @set-input-volume="setInputVolume"
      @set-vox-threshold="setVoxThreshold"
      @toggle-mic-test="toggleMicTest"
      @output-device-change="onOutputDeviceChange"
      @set-output-volume="setOutputVolume"
      @set-notification-volume="setNotificationVolume"
    />

    <Toaster :label="t('notifications')" :dismiss-label="t('close')" class="p-6 min-[851px]:p-[calc(24px/var(--ui-scale))]" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { showToast } from "@/lib/use-toast";
import JoinForm from "../components/join/JoinForm.vue";
import JoinFooter from "../components/join/JoinFooter.vue";
import JoinHeader from "../components/join/JoinHeader.vue";
import JoinHero from "../components/join/JoinHero.vue";
import QqDialog from "../components/join/QqDialog.vue";
import NetworkPerformancePanel from "../components/room/NetworkPerformancePanel.vue";
import WorkspaceHeader from "../components/room/WorkspaceHeader.vue";
import ReconnectBanner from "../components/room/ReconnectBanner.vue";
import AudioNoticeBanner from "../components/room/AudioNoticeBanner.vue";
import PokeStack from "../components/room/PokeStack.vue";
import DesktopAudioDock from "../components/room/DesktopAudioDock.vue";
import ChatPanel from "../components/room/ChatPanel.vue";
import MemberPanel from "../components/room/MemberPanel.vue";
import MemberTree from "../components/room/MemberTree.vue";
import ScreenSharePlayer from "../components/room/ScreenSharePlayer.vue";
import VoiceGrid from "../components/room/VoiceGrid.vue";
import MobileMorePanel from "../components/room/MobileMorePanel.vue";
import MobileNav from "../components/room/MobileNav.vue";
import MemberContextMenu from "../components/room/MemberContextMenu.vue";
import AudioSettingsDialog from "../components/room/AudioSettingsDialog.vue";
import ScreenShareSettingsDialog from "../components/room/ScreenShareSettingsDialog.vue";
import WhisperStrip from "../components/room/WhisperStrip.vue";
import VoiceHeading from "../components/room/VoiceHeading.vue";
import ScreenShareInlineError from "../components/room/ScreenShareInlineError.vue";
import MobileVoiceControls from "../components/room/MobileVoiceControls.vue";
import PasswordDialog from "../components/PasswordDialog.vue";
import { useTheme } from "../composables/useTheme.js";
import { useJoinForm } from "../composables/useJoinForm.js";
import { useMemberMenu } from "../composables/useMemberMenu.js";
import { useChannelTree } from "../composables/useChannelTree.js";
import { useChat } from "../composables/useChat.js";
import { useScreenShare } from "../composables/useScreenShare.js";
import { useAudioSettingsPanel } from "../composables/useAudioSettingsPanel.js";
import { useWhisper } from "../composables/useWhisper.js";
import { useNetworkPerformance } from "../composables/useNetworkPerformance.js";
import { useVoiceWebSocket, type ChannelInfo, type ChannelMember } from "../composables/useVoiceWebSocket.js";
import { isLocalPersistenceAvailable, loadLocalPreferences, loadStoredIdentity, removeStoredIdentity, saveLocalPreferences, saveStoredIdentity } from "../services/local-persistence.js";
import { isLanguage, useI18n } from "../i18n/use-i18n.js";
import { avatarStyle, isSpeaking, memberDisplayName } from "../lib/format.js";
import { localizeMessage, visibleErrorCode } from "../lib/messages.js";
import { readStorage, writeStorage, removeStorage } from "@/lib/safe-storage";

const {
  state: voiceState,
  members,
  channels,
  chatMessages,
  serverEvents,
  pokeNotifications,
  microphoneMuted,
  noiseSuppressionEnabled,
  inputVolume,
  outputVolume,
  outputMuted,
  notificationVolume,
  voxThreshold,
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputDeviceSupported,
  audioPermission,
  audioContextState,
  identityMaterial,
  micLevel,
  microphoneTestActive,
  testAudioUrl,
  speakingIds,
  volumes,
  whisperTargetIds,
  whisperActive,
  setVolume,
  setInputVolume,
  setNoiseSuppressionEnabled,
  setOutputVolume,
  toggleOutputMute,
  setVoxThreshold,
  setNotificationVolume,
  prepareInputDevices,
  refreshAudioDevices,
  setInputDevice,
  setOutputDevice,
  startMicrophoneTest,
  stopMicrophoneTest,
  playNotification,
  connect,
  reconnectNow,
  disconnect,
  switchChannel,
  moveClient,
  sendTextMessage,
  sendServerMessage,
  sendPrivateMessage,
  sendPoke,
  setAway,
  setWhisperTargets,
  setWhisperActive,
  setMicrophoneMuted,
  accompanimentActive,
  accompanimentErrorCode,
  screenShareStreams,
  screenShareActive,
  screenShareStarting,
  screenShareViewing,
  screenShareViewingStreamId,
  screenShareRemoteStream,
  screenShareError,
  screenShareErrorCode,
  screenShareRemoteVolume,
  screenShareWebRtcStats,
  startAccompaniment,
  stopAccompaniment,
  startScreenShare,
  stopScreenShare,
  joinScreenShare,
  leaveScreenShare,
  checkSupport,
  clearError,
  measureLatency,
} = useVoiceWebSocket();

const selectedChannelId = ref("");
const qqModalOpen = ref(false);
const localPersistenceAvailable = isLocalPersistenceAvailable();
const identityReady = ref(!localPersistenceAvailable);
const chatTab = ref<"channel" | "server" | "private" | "events">("channel");
const mobileSection = ref<"channels" | "chat" | "voice" | "more">("channels");
const isMobileViewport = ref(false);

const { language, loadLanguage, setLanguage, t } = useI18n();
loadLanguage();
const { themeMode, themeIcon, themeLabel, cycleTheme: cycleThemeBase, setThemeMode } = useTheme();
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
  welcomeTextZh,
  welcomeTextEn,
  welcomeTextDe,
  welcomeTextRu,
  welcomeTextJa,
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
  currentServerTarget,
  selectLocalServer,
  toggleFavorite,
  doConnect,
  doDisconnect,
  submitServerPassword,
  cancelServerPassword,
  doShare,
  clearBrowserData,
  recordServerVisit,
} = useJoinForm({
  voiceState,
  identityMaterial,
  selectedChannelId,
  connect,
  disconnect,
  clearError,
  checkSupport,
  setThemeMode,
});

const { memberMenu, memberMenuStyle, openMemberMenu, openMemberActions, onMemberMenuCloseAutoFocus } = useMemberMenu();

const {
  memberQuery,
  away,
  toggleAway,
  channelTree,
  currentChannel,
  ownChannelId,
  currentChannelName,
  currentChannelDescription,
  currentMembers,
  roomMembers,
  memberChannels,
  filteredMemberChannels,
  selectChannel,
  selectChannelById,
  channelLabel,
  channelPasswordDialog,
  submitChannelPassword,
  cancelChannelPassword,
  draggedMember,
  dragOverChannelId,
  onMemberDragStart,
  onMemberDragEnd,
  onMemberPointerDown,
  onMemberPointerMove,
  onMemberPointerUp,
  onMemberPointerCancel,
  onChannelDragOver,
  onChannelDragLeave,
  onChannelDrop,
  moveMemberDirect,
  memberMoveMenuCurrentChannel,
  memberMoveMenuCurrentSameChannel,
  memberMoveMenuOtherChannels,
} = useChannelTree({
  voiceState,
  channels,
  members,
  channel,
  selectedChannelId,
  chatTab,
  memberMenu,
  switchChannel,
  moveClient,
  clearError,
  setAway,
});

const {
  messageDraft,
  privateClientId,
  privateConversations,
  visibleChatMessages,
  chatTabLabel,
  chatPanelId,
  chatTabId,
  activeChatTabId,
  chatTitle,
  chatPlaceholder,
  formatTime,
  submitMessage,
  openPrivateChat,
  scrollChatToEnd,
  setChatListElement,
  eventText,
} = useChat({
  voiceState,
  members,
  chatMessages,
  currentChannel,
  currentChannelName,
  selectedChannelId,
  chatTab,
  memberMenu,
  isMobileViewport,
  mobileSection,
  sendTextMessage,
  sendServerMessage,
  sendPrivateMessage,
});

const {
  setScreenVideoElement,
  setScreenSharePlayerElement,
  screenShareFullscreen,
  toggleScreenShareFullscreen,
  screenShareResolutionOptions,
  screenShareResolutionPreset,
  screenShareFrameRateOptions,
  screenShareFrameRate,
  screenShareSettingsOpen,
  startScreenShareWithSettings,
  screenShareIndicatorBars,
  screenShareErrorText,
  activeScreenShareStream,
  screenSharePlayerViewers,
  screenSharePlayerViewerCount,
  screenSharePlayerOwnerName,
  screenShareStreamForMember,
  toggleScreenShareForMember,
  screenShareViewerStyle,
} = useScreenShare({
  screenShareStreams,
  screenShareViewing,
  screenShareViewingStreamId,
  screenShareRemoteStream,
  screenShareRemoteVolume,
  screenShareError,
  screenShareErrorCode,
  startScreenShare,
  joinScreenShare,
  leaveScreenShare,
  avatarStyle,
  nickname,
});

const {
  settingsOpen,
  audioSettingsError,
  onInputDeviceChange,
  onOutputDeviceChange,
  toggleMicTest,
  audioStatus,
  setMicLevelMeter,
  micMeterBars,
  meterBarHeight,
  toggleMicrophone,
  toggleAccompaniment,
} = useAudioSettingsPanel({
  voiceState,
  microphoneMuted,
  microphoneTestActive,
  accompanimentActive,
  accompanimentErrorCode,
  audioContextState,
  micLevel,
  setInputDevice,
  setOutputDevice,
  startMicrophoneTest,
  stopMicrophoneTest,
  setMicrophoneMuted,
  prepareInputDevices,
  startAccompaniment,
  stopAccompaniment,
});

const {
  whisperPttActive,
  whisperTargets,
  toggleWhisperTarget,
  clearWhisperTargets,
  onWhisperPttDown,
  onWhisperPttUp,
  stopWhisperTalk,
} = useWhisper({
  whisperTargetIds,
  members,
  setWhisperTargets,
  setWhisperActive,
});

const {
  performancePanelOpen,
  performanceRunning,
  performanceStats,
  togglePerformancePanel,
  startPerformanceMonitoring,
  stopPerformanceMonitoring,
  refreshPerformanceProbe,
} = useNetworkPerformance({
  voiceState,
  measureLatency,
});

function localizedMessage(message: string) {
  return localizeMessage(message, language.value);
}

function persistLanguage() {
  setLanguage(language.value);
  void saveLocalPreferences({ schemaVersion: 1, language: language.value });
}

function cycleTheme() {
  cycleThemeBase();
  void saveLocalPreferences({ schemaVersion: 1, theme: themeMode.value });
}

watch(() => chatMessages.length, (length, previousLength) => {
  const latest = chatMessages[length - 1];
  if (latest && length > previousLength && latest.scope === "private" && !latest.isSelf) playNotification("private");
});
watch(() => voiceState.errorCode, (code) => {
  if (code !== "SERVER_PASSWORD_REQUIRED" && code !== "INVALID_SERVER_PASSWORD") return;
  serverPasswordDialog.open = true;
  serverPasswordDialog.password = "";
  serverPasswordDialog.errorCode = code;
  clearError();
});
watch(() => pokeNotifications.length, (length, previousLength) => {
  const latest = pokeNotifications[length - 1];
  if (!latest || length <= previousLength) return;
  showToast(`${latest.invokerName} ${t("pokedYou")}${latest.message ? `：${latest.message}` : ""}`);
  playNotification("poke");
  if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(t("poke"), { body: `${latest.invokerName}: ${latest.message || t("pokedYou")}` });
});
watch(rememberIdentity, (remember) => {
  writeStorage("webspeak:remember-identity", remember ? "1" : "0");
  if (!remember) {
    identityMaterial.value = "";
    void removeStoredIdentity();
  }
});
watch([rememberIdentity, identityMaterial], ([remember, material]) => {
  if (remember && material) void saveStoredIdentity(material);
  if (!remember && material) identityMaterial.value = "";
});
watch(() => voiceState.connected, (connected) => {
  if (!connected) {
    stopPerformanceMonitoring();
    return;
  }
  playNotification("connected");
  recordServerVisit();
  if (performancePanelOpen.value) startPerformanceMonitoring();
});
watch(() => voiceState.reconnecting, (reconnecting, wasReconnecting) => {
  if (reconnecting && !wasReconnecting) {
    playNotification("disconnected");
  }
});
watch(() => voiceState.reconnectFailed, (failed, wasFailed) => {
  if (failed && !wasFailed) playNotification("reconnectFailed");
});

let deviceChangeHandler: (() => void) | undefined;
let viewportMediaQuery: MediaQueryList | undefined;
let viewportChangeHandler: (() => void) | undefined;

onMounted(() => {
  void loadLocalPreferences().then((preferences) => {
    if (!readStorage("webspeak:language") && isLanguage(preferences.language)) language.value = preferences.language;
    if (!readStorage("webspeak:theme") && (preferences.theme === "system" || preferences.theme === "light" || preferences.theme === "dark")) {
      setThemeMode(preferences.theme);
    }
  });
  void loadStoredIdentity().then((stored) => {
    if (stored && readStorage("webspeak:remember-identity") !== "0") {
      identityMaterial.value = stored.privateMaterial;
      rememberIdentity.value = true;
    }
  }).finally(() => {
    identityReady.value = true;
  });
  deviceChangeHandler = () => { void refreshAudioDevices().catch(() => undefined); };
  navigator.mediaDevices?.addEventListener("devicechange", deviceChangeHandler);
  viewportMediaQuery = window.matchMedia("(max-width: 740px)");
  viewportChangeHandler = () => {
    isMobileViewport.value = viewportMediaQuery?.matches ?? false;
    if (!isMobileViewport.value) memberMenu.value = null;
    else if (accompanimentActive.value) void stopAccompaniment();
  };
  viewportChangeHandler();
  viewportMediaQuery.addEventListener?.("change", viewportChangeHandler);
});
onUnmounted(() => {
  stopPerformanceMonitoring();
  disconnect();
  if (deviceChangeHandler) navigator.mediaDevices?.removeEventListener("devicechange", deviceChangeHandler);
  if (viewportMediaQuery && viewportChangeHandler) viewportMediaQuery.removeEventListener?.("change", viewportChangeHandler);
});

function pokeMember(member: ChannelMember): void {
  sendPoke(member.id, window.prompt(t("pokeMessagePrompt"), "") ?? "");
  showToast(t("pokeSent"));
}

function copyMemberName(member: ChannelMember): void {
  navigator.clipboard?.writeText(member.nickname).then(() => showToast(t("copiedNickname")), () => showToast(t("copyFailedToast"), "danger"));
}

function dismissPoke(id: string): void {
  const index = pokeNotifications.findIndex((poke) => poke.id === id);
  if (index >= 0) pokeNotifications.splice(index, 1);
}

</script>

<style scoped>
:global(*) { box-sizing: border-box; }
:global(body) { margin: 0; background: var(--ws-surface-0); color: var(--ws-fg); font-family: var(--font-sans); }

.web-client { min-height: 100dvh; outline: none; background: var(--ws-surface-0); color: var(--ws-fg); line-height: normal; }
.join-page { min-height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: var(--ws-surface-0); }
.join-header, .join-content { width: min(1240px, calc(100% - 64px)); margin: 0 auto; }
.join-header, .join-content { position: relative; z-index: 1; }
.join-header { z-index: 10; }
.join-header { min-height: 84px; display: flex; align-items: center; justify-content: space-between; }
.language-switch { min-width: 50px; min-height: 28px; padding: 0 9px; color: var(--ws-accent); background: var(--ws-accent-soft); border: 1px solid var(--ws-line); border-radius: 7px; font-size: 10px; font-weight: 700; cursor: pointer; transition: .18s; }
.language-switch:hover { color: var(--ws-accent-fg); background: var(--ws-accent); border-color: var(--ws-accent); }
.join-content { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(480px, 520px); align-items: center; gap: clamp(40px, 6vw, 88px); padding: 38px 0 56px; }
.app-shell { display: grid; grid-template-columns: 76px 292px minmax(0, 1fr) 246px; height: 100dvh; overflow: hidden; background: var(--ws-surface-1); }

.workspace { display: flex; min-width: 0; flex-direction: column; background: var(--ws-surface-1); }
.workspace-scroll { flex: 1; overflow-y: auto; }.workspace-content { width: min(950px, calc(100% - 64px)); margin: 0 auto; padding: 31px 0 27px; }
.voice-section { margin-top: 34px; }


@keyframes join-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes join-title-in { from { opacity: 0; letter-spacing: -.02em; transform: translateY(18px) scale(.98); } to { opacity: 1; letter-spacing: -.075em; transform: translateY(0) scale(1); } }
@keyframes join-accent-breathe { 0%, 100% { transform: translateY(0); text-shadow: 0 0 0 color-mix(in srgb, var(--ws-accent) 0%, transparent); } 50% { transform: translateY(-2px); text-shadow: 0 5px 18px color-mix(in srgb, var(--ws-accent) 16%, transparent); } }
@keyframes join-accent-breathe-dark { 0%, 100% { transform: translateY(0); text-shadow: 0 0 8px color-mix(in srgb, var(--ws-success) 28%, transparent), 0 0 18px color-mix(in srgb, var(--ws-accent) 14%, transparent); } 50% { transform: translateY(-2px); text-shadow: 0 0 13px color-mix(in srgb, var(--ws-success) 50%, transparent), 0 0 26px color-mix(in srgb, var(--ws-accent) 22%, transparent); } }
@keyframes join-dot-pulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in srgb, var(--ws-success) 28%, transparent); } 50% { transform: scale(1.18); box-shadow: 0 0 0 6px color-mix(in srgb, var(--ws-success) 0%, transparent); } }
.join-page .join-header { animation: join-fade-up .55s cubic-bezier(.22, 1, .36, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .join-page *, .join-page *::before, .join-page *::after { animation: none !important; transition-duration: .01ms !important; }
}

@media (max-width: 1200px) { .app-shell { grid-template-columns: 72px 255px minmax(0, 1fr) 218px; }.workspace-content { width: min(900px, calc(100% - 42px)); }}
@media (max-width: 980px) { .app-shell { grid-template-columns: 70px 245px minmax(0, 1fr); }.join-content { gap: 40px; } }
@media (max-width: 740px) { .join-header, .join-content { width: min(100% - 32px, 560px); }.join-header { min-height: 70px; }.join-content { display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 35px; padding: 36px 0 48px; }.app-shell { display: block; height: 100dvh; }.workspace { height: 100%; }.workspace-content { width: calc(100% - 30px); padding-top: 18px; }.voice-section, .chat-panel { margin-top: 25px; } }

/* The connected view keeps only controls that have a working action. The
   channel tree lives with the member list so every channel remains visible
   even when the current user is elsewhere. */
.app-shell { grid-template-columns: minmax(0, 1fr) 318px; }
.workspace { min-width: 0; }

/* Increase connected-view typography by 25% while keeping the layout compact. */
.join-page .language-switch { font-size: 12.5px; }

@media (min-width: 741px) and (max-width: 980px) { .app-shell { grid-template-columns: minmax(0, 1fr); }}
@media (max-width: 980px) { .app-shell { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(210px, 35dvh); }.workspace { height: auto; min-height: 0; }}
@media (max-width: 740px) { .app-shell { display: grid; grid-template-rows: minmax(0, 1fr) 220px; } }

/* Keep the connected workspace sized to the browser viewport and let the
   workspace and member tree own their scroll areas when the window shrinks. */
:global(html), :global(body), :global(#app) { width: 100%; height: 100dvh; min-height: 0; max-height: 100dvh; }
:global(body) { overflow-x: hidden; overflow-y: auto; }
.web-client { height: 100dvh; min-height: 0; max-height: 100dvh; }
.web-client { overflow: hidden; }
.join-page { height: 100dvh; min-height: 0; overflow-y: auto; }
.app-shell { grid-template-columns: 318px minmax(0, 1fr); height: 100dvh; min-height: 0; max-height: 100dvh; }
.workspace { grid-column: 2; grid-row: 1; min-height: 0; height: 100%; }
.workspace-scroll { min-height: 0; padding-bottom: env(safe-area-inset-bottom, 0px); }
.workspace-content { padding-bottom: 64px; }

@media (max-width: 980px) {
  .app-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(210px, 35dvh); }
  .workspace { grid-column: 1; grid-row: 1; height: auto; }
  
}

@media (max-width: 740px) {
  .app-shell { grid-template-rows: minmax(0, 1fr) 220px; }
}

/* Desktop audio controls live in the member rail so the workspace header
   stays focused on navigation. Mobile keeps its existing controls below the
   voice cards and in the More panel. */


.web-client { background: var(--ws-surface-0); color: var(--ws-fg); }
.join-page { background-color: var(--ws-surface-0); color: var(--ws-fg); }
.app-shell, .workspace { background: var(--ws-surface-1); }
.workspace-content { color: var(--ws-fg); }
:global(button:focus-visible), :global(a:focus-visible), :global(input:focus-visible), :global(select:focus-visible), :global(textarea:focus-visible) { outline: 3px solid color-mix(in srgb, var(--ws-accent) 55%, transparent); outline-offset: 2px; }
@media (max-width: 740px) { .workspace-scroll { overscroll-behavior: contain; }.workspace-content { width: min(100% - 24px, 650px); padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); } }

/* M008 mobile navigation. */
.mobile-section-hidden { display: block; }

@media (min-width: 741px) {
  .app-shell .mobile-section-hidden { display: block; }
}

@media (max-width: 740px) {
  .app-shell { display: flex; flex-direction: column; height: auto; min-height: 100dvh; max-height: none; padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px)); overflow: visible; }
  .app-shell .workspace { display: flex; flex: 1 1 auto; height: calc(100dvh - 61px); min-height: 0; }
  .app-shell .workspace-scroll { flex: 1; height: 100%; min-height: 0; overflow-y: auto; }
  .app-shell .mobile-section-hidden { display: none; }
  .app-shell.mobile-view-more .workspace { display: none; }

  
}

/* Keep the desktop join card comfortable without making the welcome page
   taller than the browser. Smaller viewports can scroll inside the card. */
@media (min-width: 741px) {
  .join-header { min-height: 72px; }
  .join-content { padding: 28px 0 36px; }
}

/* The document itself never becomes the scroll surface. Each view owns its
   content scroll area so headers, controls and mobile navigation stay fixed. */
:global(html), :global(body), :global(#app) { width: 100%; height: 100dvh; min-height: 0; max-height: 100dvh; overflow: hidden; }
.join-page { height: 100dvh; min-height: 0; overflow: hidden; }
.join-content { min-height: 0; overflow-y: auto; }

/* Desktop zoom compensation. main.ts sets --ui-scale (>1 only on large
   viewports) and App.vue applies zoom:var(--ui-scale) on #app. html/body stay
   pinned to the real viewport (100dvh) while the zoomed roots divide their
   height by the scale so the rendered result lands on exactly one viewport.
   Without this a 2K/4K viewport would render a 1.5x-tall shell, clipping the
   bottom of the workspace and leaving blank space under the control dock.
   Non-zero fixed offsets (poke banner stack, in the template) are divided back to CSS pixels
   because zoom also scales fixed coordinates against the viewport. */
@media (min-width: 851px) {
  :global(html), :global(body) { height: 100dvh; max-height: 100dvh; }
  :global(#app), .web-client, .join-page, .app-shell { height: calc(100dvh / var(--ui-scale)); min-height: 0; max-height: calc(100dvh / var(--ui-scale)); }
}

@media (max-width: 740px) {
  .join-content { overflow-y: auto; }
  .app-shell { height: 100dvh; min-height: 0; max-height: 100dvh; padding-bottom: calc(74px + env(safe-area-inset-bottom, 0px)); overflow: hidden; }
  .app-shell .workspace { height: auto; min-height: 0; flex: 1 1 auto; }
  .app-shell.mobile-view-channels .workspace { display: none; }
  
}

/* Match every native scroll surface to the WebSpeak palette. */
:global(*) { scrollbar-color: var(--ws-line-strong) transparent; scrollbar-width: thin; }
:global(*::-webkit-scrollbar) { width: 8px; height: 8px; }
:global(*::-webkit-scrollbar-track) { background: transparent; }
:global(*::-webkit-scrollbar-thumb) { background: var(--ws-line-strong); background-clip: padding-box; border: 2px solid transparent; border-radius: 999px; }
:global(*::-webkit-scrollbar-thumb:hover) { background: var(--ws-fg-muted); background-clip: padding-box; border-width: 1px; }

/* Mobile interaction pass: keep the browser viewport fixed and give each
   mobile surface its own touch-friendly scroll area. */
@media (max-width: 740px) {
  :global(html), :global(body), :global(#app) { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; }
  .web-client { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; }
  .app-shell { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; padding-bottom: calc(74px + env(safe-area-inset-bottom, 0px)); overflow: hidden; }
  .app-shell .workspace { height: calc(100dvh - 74px - env(safe-area-inset-bottom, 0px)); height: calc(100svh - 74px - env(safe-area-inset-bottom, 0px)); min-height: 0; max-height: calc(100dvh - 74px - env(safe-area-inset-bottom, 0px)); max-height: calc(100svh - 74px - env(safe-area-inset-bottom, 0px)); overflow: hidden; }
  .app-shell .workspace-scroll { height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
  .workspace-content { display: block; width: 100%; max-width: none; min-height: 100%; margin: 0; padding: 14px 14px calc(18px + env(safe-area-inset-bottom, 0px)); box-sizing: border-box; }
  .voice-section { margin-top: 21px; }

  

  

  

  
  .app-shell.mobile-view-chat .workspace-scroll { overflow: hidden; }
  .app-shell.mobile-view-chat .workspace-content { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 0 14px calc(8px + env(safe-area-inset-bottom, 0px)); }


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

/* Desktop audio popovers: keep the rail compact and reveal each control's
   adjustment surface only while the pointer or keyboard focus is on it. */
@media (min-width: 741px) {
  /* 桌面端悬浮（仅 ≥741px 生效，≤740px 移动端布局不受影响）：
     1) 桌面控制坞 .desktop-audio-dock 脱离文档流悬浮于成员面板底部，
        仍浮在原布局位置（距面板底 18px），宽度跟随面板内容宽度
        （left/right 各留 18px，与 member-panel 水平内边距一致，
        随列宽自适应伸缩）；高度仍由内容撑起。member-panel 作为
        absolute 包含块并加 padding-bottom 补偿原占位，避免成员列表
        被遮挡。
     2) 消息输入框 .message-composer 脱离文档流悬浮于聊天面板底部，
        宽度跟随聊天面板内容宽度（chat-panel 水平内边距为 0，
        left/right:0 即与内容宽度完全一致）；chat-panel 作为包含块
        并加 padding-bottom 补偿原占位，避免消息列表被遮挡。 */
}

@keyframes screen-share-live-dot { 0%, 100% { opacity: .55; transform: scale(.86); } 50% { opacity: 1; transform: scale(1); } }
</style>
