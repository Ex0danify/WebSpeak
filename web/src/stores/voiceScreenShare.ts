import { defineStore } from "pinia";
import { reactive, ref, shallowRef } from "vue";
import type { ScreenShareStream, ScreenShareWebRtcStats } from "../composables/voice/types";

function initialStats(): ScreenShareWebRtcStats {
  return { updatedAt: null, capture: null, peers: [] };
}

/** Reactive screen-share state the UI reads. Peers, timers, local streams and the start generation
 *  stay closure state in the composable (V-D3). */
export const useVoiceScreenShareStore = defineStore("voiceScreenShare", () => {
  const screenShareStreams = reactive<ScreenShareStream[]>([]);
  const screenShareActive = ref(false);
  const screenShareStarting = ref(false);
  const screenShareActiveStreamId = ref("");
  const screenShareViewing = ref(false);
  const screenShareViewingStreamId = ref("");
  // A MediaStream is not proxied by Vue either way; shallowRef just says so.
  const screenShareRemoteStream = shallowRef<MediaStream | null>(null);
  const screenShareError = ref("");
  const screenShareErrorCode = ref("");
  const screenShareRemoteVolume = ref(1);
  const screenShareWebRtcStats = reactive<ScreenShareWebRtcStats>(initialStats());

  function reset(): void {
    screenShareStreams.splice(0);
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
    screenShareStreams, screenShareActive, screenShareStarting, screenShareActiveStreamId, screenShareViewing,
    screenShareViewingStreamId, screenShareRemoteStream, screenShareError, screenShareErrorCode,
    screenShareRemoteVolume, screenShareWebRtcStats, reset,
  };
});
