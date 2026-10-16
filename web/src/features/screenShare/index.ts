export { useScreenSharePeers } from "@/features/screenShare/useScreenSharePeers";
export { useScreenShare, type ScreenShareResolutionPreset, type UseScreenShareOptions } from "@/features/screenShare/useScreenShare";
export { useScreenShareStore } from "@/features/screenShare/stores/screenShareStore";
export { default as ScreenSharePlayer } from "@/features/screenShare/ScreenSharePlayer.vue";
export { default as ScreenShareSettingsDialog } from "@/features/screenShare/ScreenShareSettingsDialog.vue";
export { default as ScreenShareInlineError } from "@/features/screenShare/ScreenShareInlineError.vue";
export type {
  ScreenShareCaptureStats,
  ScreenShareOutputSettings,
  ScreenSharePeerStats,
  ScreenShareSignal,
  ScreenShareStream,
  ScreenShareViewer,
  ScreenShareWebRtcStats,
} from "@/features/screenShare/screenShareTypes";
export { translations as screenShareMessages } from "@/features/screenShare/i18n/index.js";
