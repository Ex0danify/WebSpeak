<template>
  <div :class="['app-shell', `mobile-view-${mobileSection}`]">
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
      <AudioNoticeBanner :audio-notice="voiceState.audioNotice" />
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
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n";
import type { useAppearance } from "@/shared/composables/useAppearance";
import type { useScreenShare } from "@/features/screenShare";
import ChatPanel from "../chat/ChatPanel.vue";
import type { useChat } from "../chat/useChat";
import DesktopAudioDock from "../audioSettings/DesktopAudioDock.vue";
import type { useAudioSettingsPanel } from "../audioSettings/useAudioSettingsPanel";
import MemberPanel from "../members/MemberPanel.vue";
import MemberTree from "../members/MemberTree.vue";
import type { useChannelTree } from "../members/useChannelTree";
import type { useMemberMenu } from "../members/useMemberMenu";
import NetworkPerformancePanel from "../network/NetworkPerformancePanel.vue";
import type { useNetworkPerformance } from "../network/useNetworkPerformance";
import VoiceGrid from "../voiceGrid/VoiceGrid.vue";
import VoiceHeading from "../voiceGrid/VoiceHeading.vue";
import MobileVoiceControls from "../voiceGrid/MobileVoiceControls.vue";
import PokeStack from "../whisper/PokeStack.vue";
import WhisperStrip from "../whisper/WhisperStrip.vue";
import type { useWhisper } from "../whisper/useWhisper";
import type { RoomSession } from "../roomTypes";
import AudioNoticeBanner from "./AudioNoticeBanner.vue";
import MobileMorePanel from "./MobileMorePanel.vue";
import MobileNav from "./MobileNav.vue";
import ReconnectBanner from "./ReconnectBanner.vue";
import WorkspaceHeader from "./WorkspaceHeader.vue";
import type { useRoomShell } from "./useRoomShell";
import { ScreenShareInlineError, ScreenSharePlayer, ScreenShareSettingsDialog } from "@/features/screenShare";

/** The connected workspace. It takes the return values of the composables RoomView
 *  assembles; refs live inside these objects so they stay refs here (a top-level ref prop would
 *  be unwrapped by the parent template).
 *  `session` is the grouped room session. */
const props = defineProps<{
  session: RoomSession;
  shell: ReturnType<typeof useRoomShell>;
  tree: ReturnType<typeof useChannelTree>;
  chat: ReturnType<typeof useChat> & { chatTab: Ref<"channel" | "server" | "private" | "events"> };
  screenShare: ReturnType<typeof useScreenShare>;
  audioPanel: ReturnType<typeof useAudioSettingsPanel>;
  whisper: ReturnType<typeof useWhisper>;
  performance: ReturnType<typeof useNetworkPerformance>;
  memberMenu: Pick<ReturnType<typeof useMemberMenu>, "openMemberMenu" | "openMemberActions">;
  appearance: Pick<ReturnType<typeof useAppearance>, "themeIcon" | "themeLabel" | "cycleTheme" | "persistLanguage">;
  doShare: () => void;
  doDisconnect: () => void;
}>();

const { t } = useI18n();
const { state: voiceState, reconnectNow } = props.session.session;
const { members, serverEvents, pokeNotifications, speakingIds, volumes, whisperTargetIds, whisperActive } = props.session.roster;
const {
  microphoneMuted, noiseSuppressionEnabled, inputVolume, outputVolume, outputMuted, setVolume, setInputVolume,
  setNoiseSuppressionEnabled, setOutputVolume, toggleOutputMute, accompanimentActive
} = props.session.audio;
const {
  screenShareActive, screenShareStarting, screenShareViewing, screenShareViewingStreamId, screenShareRemoteStream,
  screenShareError, screenShareRemoteVolume, screenShareWebRtcStats, stopScreenShare, leaveScreenShare
} = props.session.screenShare;
const { mobileSection, isMobileViewport, dismissPoke } = props.shell;
const {
  memberQuery, away, toggleAway, currentChannel, currentChannelName, currentMembers, roomMembers,
  filteredMemberChannels, selectChannel, dragOverChannelId, draggedMember, onMemberDragStart, onMemberDragEnd,
  onMemberPointerDown, onMemberPointerMove, onMemberPointerUp, onMemberPointerCancel, onChannelDragOver,
  onChannelDragLeave, onChannelDrop
} = props.tree;
const {
  chatTab, messageDraft, privateClientId, privateConversations, visibleChatMessages, chatTabLabel, chatPanelId,
  chatTabId, activeChatTabId, chatTitle, chatPlaceholder, formatTime, submitMessage, openPrivateChat,
  setChatListElement, eventText
} = props.chat;
const {
  setScreenVideoElement, setScreenSharePlayerElement, screenShareFullscreen, toggleScreenShareFullscreen,
  screenShareResolutionOptions, screenShareResolutionPreset, screenShareFrameRateOptions, screenShareFrameRate,
  screenShareSettingsOpen, startScreenShareWithSettings, screenShareIndicatorBars, screenShareErrorText,
  screenSharePlayerViewers, screenSharePlayerViewerCount, screenSharePlayerOwnerName, screenShareStreamForMember,
  toggleScreenShareForMember, screenShareViewerStyle
} = props.screenShare;
const { settingsOpen, toggleMicrophone, toggleAccompaniment } = props.audioPanel;
const { whisperPttActive, whisperTargets, clearWhisperTargets, onWhisperPttDown, onWhisperPttUp } = props.whisper;
const { performancePanelOpen, performanceRunning, performanceStats, togglePerformancePanel, refreshPerformanceProbe } = props.performance;
const { openMemberActions, openMemberMenu } = props.memberMenu;
const { themeIcon, themeLabel, cycleTheme, persistLanguage } = props.appearance;
const { doShare, doDisconnect } = props;
</script>

<style scoped>
.app-shell { display: grid; grid-template-columns: 76px 292px minmax(0, 1fr) 246px; height: 100dvh; overflow: hidden; background: var(--ws-surface-1); }

.workspace { display: flex; min-width: 0; flex-direction: column; background: var(--ws-surface-1); }
.workspace-scroll { flex: 1; overflow-y: auto; }.workspace-content { width: min(950px, calc(100% - 64px)); margin: 0 auto; padding: 31px 0 27px; }
.voice-section { margin-top: 34px; }

@media (max-width: 1200px) { .app-shell { grid-template-columns: 72px 255px minmax(0, 1fr) 218px; }.workspace-content { width: min(900px, calc(100% - 42px)); }}
@media (max-width: 980px) { .app-shell { grid-template-columns: 70px 245px minmax(0, 1fr); } }
@media (max-width: 740px) { .app-shell { display: block; height: 100dvh; }.workspace { height: 100%; }.workspace-content { width: calc(100% - 30px); padding-top: 18px; }.voice-section, .chat-panel { margin-top: 25px; } }

/* The connected view keeps only controls that have a working action. The
   channel tree lives with the member list so every channel remains visible
   even when the current user is elsewhere. */
.app-shell { grid-template-columns: minmax(0, 1fr) 318px; }
.workspace { min-width: 0; }

@media (min-width: 741px) and (max-width: 980px) { .app-shell { grid-template-columns: minmax(0, 1fr); }}
@media (max-width: 980px) { .app-shell { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(210px, 35dvh); }.workspace { height: auto; min-height: 0; }}
@media (max-width: 740px) { .app-shell { display: grid; grid-template-rows: minmax(0, 1fr) 220px; } }

/* Keep the connected workspace sized to the browser viewport and let the
   workspace and member tree own their scroll areas when the window shrinks. */
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

.app-shell, .workspace { background: var(--ws-surface-1); }
.workspace-content { color: var(--ws-fg); }
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

/* See ClientLayout.vue: main.ts sets --ui-scale and the zoomed roots divide
   their height by it so the shell lands on exactly one viewport. */
@media (min-width: 851px) {
  .app-shell { height: calc(100dvh / var(--ui-scale)); min-height: 0; max-height: calc(100dvh / var(--ui-scale)); }
}

@media (max-width: 740px) {
  .app-shell { height: 100dvh; min-height: 0; max-height: 100dvh; padding-bottom: calc(74px + env(safe-area-inset-bottom, 0px)); overflow: hidden; }
  .app-shell .workspace { height: auto; min-height: 0; flex: 1 1 auto; }
  .app-shell.mobile-view-channels .workspace { display: none; }
}

/* Mobile interaction pass: keep the browser viewport fixed and give each
   mobile surface its own touch-friendly scroll area. */
@media (max-width: 740px) {
  .app-shell { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; padding-bottom: calc(74px + env(safe-area-inset-bottom, 0px)); overflow: hidden; }
  .app-shell .workspace { height: calc(100dvh - 74px - env(safe-area-inset-bottom, 0px)); height: calc(100svh - 74px - env(safe-area-inset-bottom, 0px)); min-height: 0; max-height: calc(100dvh - 74px - env(safe-area-inset-bottom, 0px)); max-height: calc(100svh - 74px - env(safe-area-inset-bottom, 0px)); overflow: hidden; }
  .app-shell .workspace-scroll { height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
  .workspace-content { display: block; width: 100%; max-width: none; min-height: 100%; margin: 0; padding: 14px 14px calc(18px + env(safe-area-inset-bottom, 0px)); box-sizing: border-box; }
  .voice-section { margin-top: 21px; }
  .app-shell.mobile-view-chat .workspace-scroll { overflow: hidden; }
  .app-shell.mobile-view-chat .workspace-content { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 0 14px calc(8px + env(safe-area-inset-bottom, 0px)); }
}
</style>
