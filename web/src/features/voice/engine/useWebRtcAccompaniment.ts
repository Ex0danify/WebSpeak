import { storeToRefs } from "pinia";
import type { Ref } from "vue";
import { useVoiceAudioStore } from "../stores/voiceAudioStore";

/** What the accompaniment needs from the transport that owns the peer and the mix. */
export interface WebRtcAccompanimentDeps {
  getMicStream(): MediaStream | null;
  sendCmd(type: string, payload?: Record<string, unknown>): void;
  webrtcActive: Ref<boolean>;
  hasPeer(): boolean;
  replaceWebRtcAudioTrack(): Promise<void>;
  stopWebRtcMix(): void;
}

/** The accompaniment (shared display audio) that joins the WebRTC mix. The capture stream is non-reactive
 *  closure state; the transport reads it through `getAccompanimentStream()` when it builds the mix. */
export function useWebRtcAccompaniment(deps: WebRtcAccompanimentDeps) {
  const audio = useVoiceAudioStore();
  const { accompanimentActive, accompanimentSupported, accompanimentErrorCode } = storeToRefs(audio);
  const { webrtcActive } = deps;

  let accompanimentStream: MediaStream | null = null;

  function releaseAccompanimentStream(): void {
    accompanimentStream?.getTracks().forEach((track) => track.stop());
    accompanimentStream = null;
    accompanimentActive.value = false;
  }

  async function startAccompaniment(): Promise<void> {
    accompanimentErrorCode.value = "";
    if (!accompanimentSupported.value) {
      accompanimentErrorCode.value = "unsupported";
      throw new Error("Accompaniment sharing is unavailable");
    }
    if (!webrtcActive.value || !deps.hasPeer() || !deps.getMicStream()) {
      accompanimentErrorCode.value = "needsWebRtc";
      throw new Error("Accompaniment needs WebRTC");
    }

    const captureProcessingConstraints: MediaTrackConstraints = {
      // Display/application audio must not pass through browser voice processing. Those processors are made for speech and can
      // change music level frame to frame (AGC), suppress quiet passages or cancel sustained tones.
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
    };
    const audioConstraints = { ...captureProcessingConstraints } as MediaTrackConstraints & { restrictOwnAudio?: boolean };
    const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.() as Record<string, boolean> | undefined;
    if (supportedConstraints?.restrictOwnAudio) audioConstraints.restrictOwnAudio = true;
    const options = {
      video: { displaySurface: "browser" },
      audio: audioConstraints,
      selfBrowserSurface: "exclude",
      systemAudio: "include",
      windowAudio: "window",
    } as unknown as DisplayMediaStreamOptions;

    let nextStream: MediaStream;
    try {
      nextStream = await navigator.mediaDevices.getDisplayMedia(options);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      accompanimentErrorCode.value = "permission";
      throw error;
    }
    const audioTrack = nextStream.getAudioTracks()[0];
    nextStream.getVideoTracks().forEach((track) => track.stop());
    if (!audioTrack) {
      nextStream.getTracks().forEach((track) => track.stop());
      accompanimentErrorCode.value = "noAudio";
      throw new Error("The selected source has no audio to share");
    }

    try {
      // Do not pass the Chromium-only restrictOwnAudio hint to applyConstraints, rejecting an unknown key could make the
      // browser discard all three standard processing-off constraints.
      await audioTrack.applyConstraints(captureProcessingConstraints);
    } catch {
      // Some browsers expose display audio but reject optional processing constraints. The capture still proceeds, without
      // adding a WebSpeak-side gain stage.
    }
    if ("contentHint" in audioTrack) audioTrack.contentHint = "music";

    accompanimentStream?.getTracks().forEach((track) => track.stop());
    accompanimentStream = nextStream;
    accompanimentActive.value = true;
    deps.sendCmd("setAccompanimentActive", { active: true });
    audioTrack.addEventListener(
      "ended",
      () => {
        void stopAccompaniment();
      },
      { once: true },
    );
    try {
      await deps.replaceWebRtcAudioTrack();
    } catch (error) {
      releaseAccompanimentStream();
      deps.sendCmd("setAccompanimentActive", { active: false });
      deps.stopWebRtcMix();
      accompanimentErrorCode.value = "permission";
      throw error;
    }
  }

  async function stopAccompaniment(): Promise<void> {
    accompanimentErrorCode.value = "";
    releaseAccompanimentStream();
    if (webrtcActive.value) deps.sendCmd("setAccompanimentActive", { active: false });
    if (webrtcActive.value && deps.hasPeer() && deps.getMicStream()) await deps.replaceWebRtcAudioTrack();
    else deps.stopWebRtcMix();
  }

  function getAccompanimentStream(): MediaStream | null {
    return accompanimentStream;
  }

  return { startAccompaniment, stopAccompaniment, releaseAccompanimentStream, getAccompanimentStream };
}
