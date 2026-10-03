export { useScreenSharePeers } from "./useScreenSharePeers";
export { useScreenShare, type ScreenShareResolutionPreset, type UseScreenShareOptions } from "./useScreenShare";
export { useScreenShareStore } from "./stores/screenShareStore";
export { default as ScreenSharePlayer } from "./ScreenSharePlayer.vue";
export { default as ScreenShareSettingsDialog } from "./ScreenShareSettingsDialog.vue";
export { default as ScreenShareInlineError } from "./ScreenShareInlineError.vue";
export type {
  ScreenShareCaptureStats,
  ScreenShareOutputSettings,
  ScreenSharePeerStats,
  ScreenShareSignal,
  ScreenShareStream,
  ScreenShareViewer,
  ScreenShareWebRtcStats,
} from "./screenShareTypes";
export { translations as screenShareMessages } from "./i18n/index.js";
