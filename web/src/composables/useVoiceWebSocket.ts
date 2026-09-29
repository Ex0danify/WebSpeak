import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useAudioOutput } from "./voice/useAudioOutput";
import { usePlayback } from "./voice/usePlayback";
import { useAudioPreferences } from "./voice/useAudioPreferences";
import { useMicrophone } from "./voice/useMicrophone";
import { useWebRtcTransport } from "./voice/useWebRtcTransport";
import { useRoomActions } from "./voice/useRoomActions";
import { createMessageRouter, createRosterHandlers } from "./voice/message-router";
import { useConnection } from "./voice/useConnection";
import { useScreenSharePeers } from "./voice/useScreenSharePeers";
import { useVoiceAudioStore } from "../stores/voiceAudio";
import { useVoiceScreenShareStore } from "../stores/voiceScreenShare";
import { useVoiceSessionStore } from "../stores/voiceSession";
import type {
  AudioInputDevice,
  AudioOutputDevice,
  AudioPermission,
  ChannelInfo,
  ChannelMember,
  ChatMessage,
  LatencyProbeResult,
  MicrophoneProcessingSettings,
  ScreenShareCaptureStats,
  ScreenSharePeerStats,
  ScreenShareOutputSettings,
  ScreenShareSignal,
  ScreenShareStream,
  ScreenShareViewer,
  ScreenShareWebRtcStats,
  ServerEvent,
  VoiceState,
} from "./voice/types";
import { normalizeMicrophoneFailure } from "./voice/errors";

export { normalizeMicrophoneFailure };

export type {
  AudioInputDevice,
  AudioOutputDevice,
  AudioPermission,
  ChannelInfo,
  ChannelMember,
  ChatMessage,
  LatencyProbeResult,
  MicrophoneProcessingSettings,
  ScreenShareCaptureStats,
  ScreenSharePeerStats,
  ScreenShareOutputSettings,
  ScreenShareSignal,
  ScreenShareStream,
  ScreenShareViewer,
  ScreenShareWebRtcStats,
  ServerEvent,
  VoiceState,
};


export function useVoiceWebSocket() {
  const session = useVoiceSessionStore();
  session.reset();
  const { ws, whisperActive } = storeToRefs(session);
  const audio = useVoiceAudioStore();
  audio.reset();
  const {
    microphoneMuted, noiseSuppressionEnabled, inputVolume, outputVolume, outputMuted, notificationVolume, voxThreshold,
    selectedInputDeviceId, selectedOutputDeviceId, outputDeviceSupported, audioPermission, audioContextState,
    microphoneTestActive, testAudioUrl, accompanimentActive, accompanimentSupported, accompanimentErrorCode,
  } = storeToRefs(audio);
  const { inputDevices, outputDevices, microphoneProcessing, volumes } = audio;
  const screenShare = useVoiceScreenShareStore();
  screenShare.reset();
  const {
    screenShareActive, screenShareStarting, screenShareActiveStreamId, screenShareViewing, screenShareViewingStreamId,
    screenShareRemoteStream, screenShareError, screenShareErrorCode, screenShareRemoteVolume,
  } = storeToRefs(screenShare);
  const { screenShareStreams, screenShareWebRtcStats } = screenShare;
  const { state, members, channels, chatMessages, serverEvents, pokeNotifications, speakingIds, whisperTargetIds } = session;
  const {
    sendCmd, switchChannel, moveClient, measureLatency, clearLatencyProbes,
    rejectPendingCommands, sendTextMessage, sendServerMessage, sendPrivateMessage, sendPoke, setAway, setWhisperTargets,
    setWhisperActive, applyWhisperState, handlers: roomHandlers,
  } = useRoomActions({ protocolErrorMessage: (code, fallback) => connection.protocolErrorMessage(code, fallback) });
  const {
    effectiveOutputVolume, applyOutputVolume, getAudioCtx, existingAudioCtx, releaseAudioCtx, attachWebRtcPlayback, setAudioNotice,
    clearAudioNotice, syncAudioContextNotice, setAudioSink, setOutputDevice, syncWebRtcPlayback,
    stopWebRtcPlayback, playNotification, handlers: audioOutputHandlers,
  } = useAudioOutput({ saveAudioPreferences: () => saveAudioPreferences(), remoteGains: () => playback.remoteGains });
  const {
    audioPreferencesReady, saveAudioPreferences, syncKnownMemberVolumes, setVolume, setInputVolume, setOutputVolume,
    toggleOutputMute, setVoxThreshold, setNotificationVolume,
  } = useAudioPreferences({ applyMemberVolume, applyInputVolume, applyOutputVolume });
  const webrtcActive = ref(false);
  const identityMaterial = ref("");
  const playback = usePlayback({ getAudioCtx, effectiveOutputVolume, webrtcActive });
  const { remoteGains, markSpeaking, clearSpeaking, handleAudioFrame, resetDownlink, handlers: playbackHandlers } = playback;

  const {
    startScreenShare, stopScreenShare, joinScreenShare, leaveScreenShare, stopScreenShareTransport, sendScreenShareMessage,
    handlers: screenShareHandlers,
  } = useScreenSharePeers();
  const micLevel = ref(0);
  const {
    checkSupport, refreshAudioDevices, prepareInputDevices, setInputDevice, setMicrophoneError,
    clearMicrophoneError, startMicrophone, ensureMicrophone, stopMicrophone, stopCaptureGraph, setMicrophoneMuted,
    setNoiseSuppressionEnabled, startMicrophoneTest, stopMicrophoneTest, getMicStream, getProcessedMicStream, applyMicGain,
  } = useMicrophone({
    saveAudioPreferences: () => saveAudioPreferences(),
    setAudioNotice,
    clearAudioNotice,
    existingAudioCtx,
    setAudioSink,
    getAudioCtx,
    syncAudioContextNotice,
    releaseAudioCtx,
    markSpeaking,
    clearSpeaking,
    sendCmd,
    webrtcActive,
    micLevel,
    webrtcMixMicGain: () => transport.getWebRtcMixMicGain(),
    releaseAccompanimentStream: () => transport.releaseAccompanimentStream(),
    stopWebRtcMix: () => transport.stopWebRtcMix(),
    connectionSequence: () => connection.getConnectionSequence(),
    stopWebRtcTransport: () => transport.stopWebRtcTransport(),
    startWebRtcTransport: (sequence, socket) => transport.startWebRtcTransport(sequence, socket),
  });
  // WebRTC carries audio when the gateway advertises it. The bounded PCM
  // WebSocket path remains the compatibility fallback for older browsers and
  // for deployments where the gateway's built-in UDP media range is unavailable.
  const transport = useWebRtcTransport({
    getMicStream,
    getProcessedMicStream,
    ensureMicrophone,
    startMicrophone,
    stopCaptureGraph,
    setMicrophoneError,
    getAudioCtx,
    effectiveOutputVolume,
    stopWebRtcPlayback,
    attachWebRtcPlayback,
    syncWebRtcPlayback,
    setAudioNotice,
    markSpeaking,
    clearSpeaking,
    sendCmd,
    connectionSequence: () => connection.getConnectionSequence(),
    hasLastConnection: () => connection.hasLastConnection(),
    webrtcActive,
    micLevel,
  });
  const {
    startWebRtcTransport, stopWebRtcTransport, startAccompaniment, stopAccompaniment,
    getWebRtcPeer, getWebRtcMixMicGain, handlers: transportHandlers,
  } = transport;
  const connection = useConnection({
    audioPreferencesReady, identityMaterial, handleMessage: (msg) => handleMessage(msg), handleAudioFrame, clearLatencyProbes, rejectPendingCommands,
    stopMicrophone, clearMicrophoneError, clearAudioNotice, stopScreenShareTransport, stopWebRtcTransport, resetDownlink,
    sendCmd, applyWhisperState, syncKnownMemberVolumes, ensureMicrophone, setMicrophoneError, startWebRtcTransport, sendScreenShareMessage,
  });
  const { connect, disconnect, reconnectNow, clearError, handlers: connectionHandlers } = connection;
  const handleMessage = createMessageRouter(
    createRosterHandlers({ syncKnownMemberVolumes }),
    roomHandlers,
    audioOutputHandlers,
    playbackHandlers,
    transportHandlers,
    screenShareHandlers,
    connectionHandlers,
  );

  function applyMemberVolume(clientId: number, normalized: number): void {
    const gain = remoteGains.get(clientId);
    if (gain) gain.gain.value = normalized * effectiveOutputVolume();
    if (getWebRtcPeer() || webrtcActive.value) sendCmd("setMemberVolume", { clientId, volume: normalized });
  }

  function applyInputVolume(): void {
    applyMicGain();
    const mixMicGain = getWebRtcMixMicGain();
    if (mixMicGain) mixMicGain.gain.value = microphoneMuted.value ? 0 : inputVolume.value;
  }

  return {
    ws,
    state,
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
    microphoneProcessing,
    audioContextState,
    identityMaterial,
    micLevel,
    microphoneTestActive,
    testAudioUrl,
    speakingIds,
    whisperTargetIds,
    whisperActive,
    volumes,
    accompanimentActive,
    accompanimentSupported,
    accompanimentErrorCode,
    screenShareStreams,
    screenShareActive,
    screenShareStarting,
    screenShareActiveStreamId,
    screenShareViewing,
    screenShareViewingStreamId,
    screenShareRemoteStream,
    screenShareError,
    screenShareErrorCode,
    screenShareRemoteVolume,
    screenShareWebRtcStats,
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
    ensureMicrophone,
    startAccompaniment,
    stopAccompaniment,
    startScreenShare,
    stopScreenShare,
    joinScreenShare,
    leaveScreenShare,
    checkSupport,
    clearError,
    measureLatency,
  };
}
