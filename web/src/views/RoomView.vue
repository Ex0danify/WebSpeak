<template>
  <RoomWorkspace
    :session="session"
    :shell="shell"
    :tree="tree"
    :chat="roomChat"
    :screen-share="screenShare"
    :audio-panel="audioPanel"
    :whisper="whisper"
    :performance="performance"
    :member-menu="roomMemberMenu"
    :appearance="appearance"
    :do-share="doShare"
    :do-disconnect="doDisconnect"
  />

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
    v-model:password="channelPasswordDialog.password"
    :open="channelPasswordDialog.open"
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
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { ref } from "vue";
import {
  AudioSettingsDialog,
  MemberContextMenu,
  RoomWorkspace,
  useAudioSettingsPanel,
  useChannelTree,
  useChat,
  useMemberMenu,
  useNetworkPerformance,
  useRoomContext,
  useRoomShell,
  useWhisper,
} from "@/features/room";
import PasswordDialog from "@/shared/components/PasswordDialog.vue";
import { useAppearance } from "@/shared/composables/useAppearance";
import { toast } from "@/shared/composables/useToast";
import { useJoinFormStore, useShareInvite } from "@/features/join";
import { useScreenShare } from "@/features/screenShare";
import { useI18n } from "@/shared/i18n/useI18n";
import { avatarStyle } from "@/shared/lib/format";

const session = useRoomContext();
const { state: voiceState, disconnect } = session.session;
const { pokeNotifications, volumes, whisperTargetIds } = session.roster;
const { sendPoke } = session.chat;
const {
  microphoneMuted,
  noiseSuppressionEnabled,
  inputVolume,
  outputVolume,
  notificationVolume,
  voxThreshold,
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputDeviceSupported,
  audioPermission,
  micLevel,
  microphoneTestActive,
  testAudioUrl,
  setVolume,
  setInputVolume,
  setNoiseSuppressionEnabled,
  setOutputVolume,
  setVoxThreshold,
  setNotificationVolume,
  refreshAudioDevices,
  accompanimentActive,
  stopAccompaniment,
} = session.audio;

const selectedChannelId = ref("");
const chatTab = ref<"channel" | "server" | "private" | "events">("channel");

const { t } = useI18n();
const appearance = useAppearance();
const { nickname, channel } = storeToRefs(useJoinFormStore());
const { doShare } = useShareInvite();

function doDisconnect() {
  disconnect();
  toast({ title: t("leftToast"), variant: "success", duration: 2800 });
}

const { memberMenu, memberMenuStyle, openMemberMenu, openMemberActions, onMemberMenuCloseAutoFocus } = useMemberMenu();
const roomMemberMenu = { openMemberMenu, openMemberActions };
const shell = useRoomShell({
  memberMenu,
  pokeNotifications,
  accompanimentActive,
  stopAccompaniment,
  refreshAudioDevices,
  sendPoke,
});
const { mobileSection, isMobileViewport, pokeMember, copyMemberName } = shell;

const tree = useChannelTree({
  session: session.session,
  roster: session.roster,
  actions: session.actions,
  channel,
  selectedChannelId,
  chatTab,
  memberMenu,
});
const {
  currentChannel,
  currentChannelName,
  channelPasswordDialog,
  submitChannelPassword,
  cancelChannelPassword,
  moveMemberDirect,
  memberMoveMenuCurrentChannel,
  memberMoveMenuCurrentSameChannel,
  memberMoveMenuOtherChannels,
} = tree;

const chat = useChat({
  session: session.session,
  roster: session.roster,
  chat: session.chat,
  currentChannel,
  currentChannelName,
  selectedChannelId,
  chatTab,
  memberMenu,
  isMobileViewport,
  mobileSection,
});
const { openPrivateChat } = chat;
const roomChat = { ...chat, chatTab };

const screenShare = useScreenShare({ screenShare: session.screenShare, avatarStyle, nickname });

const audioPanel = useAudioSettingsPanel({ session: session.session, audio: session.audio });
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
} = audioPanel;

const whisper = useWhisper({ roster: session.roster, actions: session.actions });
const { toggleWhisperTarget } = whisper;

const performance = useNetworkPerformance({ session: session.session });
</script>
