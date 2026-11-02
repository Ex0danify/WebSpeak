import { defineStore } from "pinia";
import type { MaybeLocalizedText } from "@/shared/i18n/localizedText";
import { reactive, ref, shallowRef } from "vue";
import type { ScreenShareStream, ScreenShareWebRtcStats } from "@/features/screenShare/screenShareTypes";

function initialStats(): ScreenShareWebRtcStats {
  return { updatedAt: null, capture: null, peers: [] };
}

/** Reactive screen-share state the UI reads. Peers, timers, local streams and the start generation
 *  stay closure state in the composable. */
export const useScreenShareStore = defineStore("voiceScreenShare", () => {
  const screenShareStreams = reactive<ScreenShareStream[]>([]);
  /** Client ids that share a screen right now, in any channel. Watching still needs a stream in your own. */
  const screenShareSharingIds = reactive(new Set<number>());
  const screenShareActive = ref(false);
  const screenShareStarting = ref(false);
  const screenShareActiveStreamId = ref("");
  const screenShareViewing = ref(false);
  const screenShareViewingStreamId = ref("");
  // A MediaStream is not proxied by Vue either way; shallowRef just says so.
  const screenShareRemoteStream = shallowRef<MediaStream | null>(null);
  const screenShareError = ref<MaybeLocalizedText>("");
  const screenShareErrorCode = ref("");
  const screenShareRemoteVolume = ref(1);
  const screenShareWebRtcStats = reactive<ScreenShareWebRtcStats>(initialStats());

  function reset(): void {
    screenShareStreams.splice(0);
    screenShareSharingIds.clear();
    screenShareActive.value = false;
    screenShareStarting.value = false;
    screenShareActiveStreamId.value = "";
    screenShareViewing.value = false;
    screenShareViewingStreamId.value = "";
    screenShareRemoteStream.value = null;
    screenShareError.value = "";
    screenShareErrorCode.value = "";
    screenShareRemoteVolume.value = 1;
    Object.assign(screenShareWebRtcStats, initialStats());
  }

  return {
    screenShareStreams,
    screenShareSharingIds,
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
    reset,
  };
});
