<template>
  <div :class="shellClass">
    <main :class="[workspaceClass, mobileSection === 'more' || mobileSection === 'channels' ? 'max-compact:hidden' : '']">
      <h1 v-if="!isMobileViewport || (mobileSection !== 'channels' && mobileSection !== 'more')" class="sr-only">{{ t("voiceSpace") }}</h1>
      <WorkspaceHeader
        :server-name="serverName"
        :online-count="members.length"
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
        <template v-if="!isMobileViewport" #event-log>
          <EventLogPopover :events="serverEvents" :event-text="eventText" :format-time="formatTime" />
        </template>
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
      <RoomNoticeBanner :notices="roomNotices" />
      <PokeStack :pokes="pokeNotifications" @dismiss="dismissPoke" />

      <div :class="bodyClass">
        <div :class="bodyInnerClass">
          <section :class="[voiceSectionClass, mobileSection !== 'voice' && 'max-compact:hidden']">
            <ScreenShareInlineError v-if="screenShareError" :text="screenShareErrorText" />
            <ScreenSharePlayer
              v-model:remote-volume="screenShareRemoteVolume"
              :viewing="screenShareViewing"
              :remote-stream="screenShareRemoteStream"
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
            <WhisperStrip
              :whisper-target-ids="whisperTargetIds"
              :whisper-active="whisperActive"
              :whisper-ptt-active="whisperPttActive"
              :whisper-targets="whisperTargets"
              @clear-targets="clearWhisperTargets"
              @ptt-down="onWhisperPttDown"
              @ptt-up="onWhisperPttUp"
            />
            <AudioDock
              v-if="isMobileViewport"
              :member="selfMember"
              :speaking="selfSpeaking"
              :connection="audioLink"
              :microphone-muted="microphoneMuted"
              :output-muted="outputMuted"
              :accompaniment-active="accompanimentActive"
              :accompaniment="accompaniment"
              :screen-share-active="screenShareActive"
              :screen-share-starting="screenShareStarting"
              :screen-share-supported="screenShareSupported"
              @toggle-microphone="toggleMicrophone"
              @toggle-output-mute="toggleOutputMute"
              @toggle-accompaniment="toggleAccompaniment"
              @open-settings="settingsOpen = true"
              @open-profile="profileOpen = true"
              @open-screen-share="screenShareSettingsOpen = true"
              @stop-screen-share="stopScreenShare"
            />
          </section>

          <ChatPanel
            v-model:chat-tab="chatTab"
            v-model:message-draft="messageDraft"
            :mobile-section="mobileSection"
            :current-channel-name="currentChannelName"
            :private-conversations="privateConversations"
            :private-conversation-id="privateConversationId"
            :chat-title="chatTitle"
            :chat-placeholder="chatPlaceholder"
            :private-peer-name="privatePeerName"
            :visible-chat-messages="visibleChatMessages"
            :members="members"
            :format-time="formatTime"
            :set-list-element="setChatListElement"
            :notices="channelNotices"
            :unread-tabs="unreadTabs"
            :at-bottom="atBottom"
            @open-private-chat="openPrivateChat"
            @submit="submitMessage"
            @jump-to-latest="scrollChatToEnd"
            @close-private-chat="closePrivateChat"
          >
            <template v-if="isMobileViewport" #bar-end>
              <EventLogPopover :events="serverEvents" :event-text="eventText" :format-time="formatTime" />
            </template>
          </ChatPanel>
        </div>
      </div>
    </main>

    <MemberPanel
      v-model:member-query="memberQuery"
      :mobile-section="mobileSection"
      :is-mobile-viewport="isMobileViewport"
      :away="away"
      :has-matches="filteredMemberChannels.length > 0"
      @toggle-away="toggleAway"
    >
      <MemberTree
        :channels="filteredMemberChannels"
        :current-channel-id="currentChannel?.id"
        :drag-over-channel-id="dragOverChannelId"
        :dragged-member-id="draggedMember?.id"
        :speaking-ids="speakingIds"
        :can-speak="canSpeak"
        :muted-members="mutedMembers"
        :is-mobile-viewport="isMobileViewport"
        :stream-for-member="screenShareStreamForMember"
        :viewing-stream-id="screenShareViewingStreamId"
        :indicator-bars="screenShareIndicatorBars"
        @toggle-screen-share="toggleScreenShareForMember"
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
      />
      <template #footer>
        <AudioDock
          v-if="!isMobileViewport"
          :member="selfMember"
          :speaking="selfSpeaking"
          :connection="audioLink"
          :microphone-muted="microphoneMuted"
          :output-muted="outputMuted"
          :accompaniment-active="accompanimentActive"
          :accompaniment="accompaniment"
          :screen-share-active="screenShareActive"
          :screen-share-starting="screenShareStarting"
          :screen-share-supported="screenShareSupported"
          @toggle-microphone="toggleMicrophone"
          @toggle-output-mute="toggleOutputMute"
          @toggle-accompaniment="toggleAccompaniment"
          @open-settings="settingsOpen = true"
          @open-profile="profileOpen = true"
          @open-screen-share="screenShareSettingsOpen = true"
          @stop-screen-share="stopScreenShare"
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
    <ProfileDialog
      v-model="profileOpen"
      v-model:saved-id="savedIdentityId"
      :member="selfMember"
      :identity-material="identityMaterial"
      :request-identity="requestIdentity"
      :change-nickname="changeNickname"
      :connection="session.session"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type Ref } from "vue";
import { isSpeaking } from "@/features/session";
import { useI18n } from "@/shared/i18n/useI18n";
import type { useAppearance } from "@/shared/composables/useAppearance";
import type { useScreenShare } from "@/features/screenShare";
import ChatPanel from "@/features/room/chat/ChatPanel.vue";
import type { useChat } from "@/features/room/chat/useChat";
import AudioDock from "@/features/room/dock/AudioDock.vue";
import { accompanimentAvailability } from "@/features/room/dock/accompanimentAvailability";
import { audioLinkStatus } from "@/features/room/dock/audioLinkStatus";
import type { useAudioSettingsPanel } from "@/features/room/audioSettings/useAudioSettingsPanel";
import EventLogPopover from "@/features/room/events/EventLogPopover.vue";
import ProfileDialog from "@/features/room/profile/ProfileDialog.vue";
import { useNicknameChange } from "@/features/room/profile/useNicknameChange";
import MemberPanel from "@/features/room/members/MemberPanel.vue";
import MemberTree from "@/features/room/members/MemberTree.vue";
import type { useChannelTree } from "@/features/room/members/useChannelTree";
import type { useMemberMenu } from "@/features/room/members/useMemberMenu";
import NetworkPerformancePanel from "@/features/room/network/NetworkPerformancePanel.vue";
import type { useNetworkPerformance } from "@/features/room/network/useNetworkPerformance";
import PokeStack from "@/features/room/whisper/PokeStack.vue";
import WhisperStrip from "@/features/room/whisper/WhisperStrip.vue";
import type { useWhisper } from "@/features/room/whisper/useWhisper";
import type { ChatTab, RoomSession } from "@/features/room/roomTypes";
import RoomNoticeBanner from "@/features/room/shell/RoomNoticeBanner.vue";
import MobileMorePanel from "@/features/room/shell/MobileMorePanel.vue";
import MobileNav from "@/features/room/shell/MobileNav.vue";
import ReconnectBanner from "@/features/room/shell/ReconnectBanner.vue";
import WorkspaceHeader from "@/features/room/shell/WorkspaceHeader.vue";
import type { useRoomShell } from "@/features/room/shell/useRoomShell";
import { ScreenShareInlineError, ScreenSharePlayer, ScreenShareSettingsDialog } from "@/features/screenShare";

/** The connected workspace. It takes the return values of the composables RoomView assembles, with refs inside these objects so
 *  they stay refs here (a top-level ref prop would be unwrapped by the parent template). `session` is the grouped room session. */
const props = defineProps<{
  session: RoomSession;
  shell: ReturnType<typeof useRoomShell>;
  tree: ReturnType<typeof useChannelTree>;
  chat: ReturnType<typeof useChat> & { chatTab: Ref<ChatTab> };
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
const { state: voiceState, roomNotices, reconnectNow, requestIdentity, identityMaterial, setNickname } = props.session.session;
const changeNickname = useNicknameChange({ setNickname });
const { members, serverEvents, serverName, pokeNotifications, speakingIds, canSpeak, mutedMembers, whisperTargetIds, whisperActive } =
  props.session.roster;
const { microphoneMuted, outputMuted, toggleOutputMute, accompanimentActive, accompanimentSupported, webrtcActive, webrtcAvailable } =
  props.session.audio;
const {
  screenShareActive,
  screenShareStarting,
  screenShareViewing,
  screenShareViewingStreamId,
  screenShareRemoteStream,
  screenShareError,
  screenShareRemoteVolume,
  screenShareWebRtcStats,
  stopScreenShare,
  leaveScreenShare,
} = props.session.screenShare;
const { mobileSection, isMobileViewport, dismissPoke } = props.shell;
const {
  memberQuery,
  away,
  toggleAway,
  currentChannel,
  currentChannelName,
  filteredMemberChannels,
  selectChannel,
  dragOverChannelId,
  draggedMember,
  onMemberDragStart,
  onMemberDragEnd,
  onMemberPointerDown,
  onMemberPointerMove,
  onMemberPointerUp,
  onMemberPointerCancel,
  onChannelDragOver,
  onChannelDragLeave,
  onChannelDrop,
} = props.tree;
const {
  chatTab,
  messageDraft,
  privateConversationId,
  privateConversations,
  visibleChatMessages,
  unreadTabs,
  closePrivateChat,
  channelNotices,
  chatTitle,
  chatPlaceholder,
  privatePeerName,
  formatTime,
  submitMessage,
  openPrivateChat,
  setChatListElement,
  atBottom,
  scrollChatToEnd,
  eventText,
} = props.chat;
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
  screenSharePlayerViewers,
  screenSharePlayerViewerCount,
  screenSharePlayerOwnerName,
  screenShareStreamForMember,
  toggleScreenShareForMember,
  screenShareViewerStyle,
} = props.screenShare;
const { settingsOpen, toggleMicrophone, toggleAccompaniment } = props.audioPanel;
const profileOpen = ref(false);
const savedIdentityId = ref<string | null>(null);

const { whisperPttActive, whisperTargets, clearWhisperTargets, onWhisperPttDown, onWhisperPttUp } = props.whisper;
const { performancePanelOpen, performanceRunning, performanceStats, togglePerformancePanel, refreshPerformanceProbe } = props.performance;
const { openMemberActions, openMemberMenu } = props.memberMenu;
const selfMember = computed(() => members.find((member) => member.isSelf) ?? null);
const audioLink = computed(() => audioLinkStatus(voiceState, roomNotices));
const accompaniment = computed(() =>
  accompanimentAvailability({
    supported: accompanimentSupported.value,
    active: accompanimentActive.value,
    webrtcAvailable: webrtcAvailable.value,
    webrtcActive: webrtcActive.value,
    connection: audioLink.value,
  }),
);
const selfSpeaking = computed(() => (selfMember.value ? isSpeaking(selfMember.value, speakingIds) : false));

// Browsers without screen capture (most phones) get no share button.
const screenShareSupported = typeof navigator.mediaDevices?.getDisplayMedia === "function";
const { themeIcon, themeLabel, cycleTheme, persistLanguage } = props.appearance;
const { doShare, doDisconnect } = props;

// Frame of the connected view. Desktop has the member panel (318 px) beside the workspace, one viewport tall (the height is
// divided by --ui-scale like the zoomed roots). Up to 980 px the member panel moves below the workspace, up to 740 px the shell
// is a column with the bottom navigation reserved.
const shellClass =
  "grid h-dvh max-h-dvh min-h-0 grid-cols-[318px_minmax(0,1fr)] overflow-hidden bg-surface-1 desktop:h-[calc(100dvh/var(--ui-scale))] desktop:max-h-[calc(100dvh/var(--ui-scale))] max-medium:grid-cols-1 max-medium:grid-rows-[minmax(0,1fr)_minmax(210px,35dvh)] max-compact:flex max-compact:h-svh max-compact:max-h-svh max-compact:min-h-svh max-compact:flex-col max-compact:pb-[calc(74px+env(safe-area-inset-bottom,0px))]";
const workspaceClass =
  "col-start-2 row-start-1 flex h-full min-h-0 min-w-0 flex-col bg-surface-1 max-medium:col-start-1 max-medium:h-auto max-compact:h-[calc(100svh-74px-env(safe-area-inset-bottom,0px))] max-compact:max-h-[calc(100svh-74px-env(safe-area-inset-bottom,0px))] max-compact:flex-auto max-compact:overflow-hidden";
// The page never scrolls: the voice section above the chat is short and the message list takes the rest of the height. On a
// phone the voice section is a screen of its own and scrolls.
const bodyClass = "flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom,0px)]";
const bodyInnerClass = "flex min-h-0 flex-1 flex-col text-fg";
const voiceSectionClass =
  "mx-auto max-h-[55%] w-[min(950px,calc(100%-64px))] shrink-0 overflow-y-auto pt-5 empty:hidden max-wide:w-[min(900px,calc(100%-42px))] max-compact:m-0 max-compact:max-h-none max-compact:w-full max-compact:flex-1 max-compact:overscroll-contain max-compact:px-3.5 max-compact:pt-3.5 max-compact:pb-[calc(18px+env(safe-area-inset-bottom,0px))]";
</script>
