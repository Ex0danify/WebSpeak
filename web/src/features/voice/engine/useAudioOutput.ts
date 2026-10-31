import { storeToRefs } from "pinia";
import { writeStorage } from "@/shared/services/safeStorage";
import { useVoiceAudioStore } from "@/features/voice/stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import { safeClientErrorCode, safeClientErrorDetail } from "@/features/session";
import { LocalizedError, text, type TextParams } from "@/shared/i18n/localizedText";
import { audioNoticeText } from "@/features/voice/voiceErrors";
import type { SinkAudioContext, SinkAudioElement } from "@/features/voice/voiceTypes";
import type { MessageHandlers } from "@/features/session";
import { playNotificationSound, type NotificationSound } from "@/features/voice/engine/notificationSounds";

/** Late-bound pieces owned by other modules: the assembler passes them in, this module never imports them. */
export interface AudioOutputDeps {
  saveAudioPreferences(): Promise<void>;
  /** The per-client playback gain nodes, they live with the downlink playback and are resolved at call time. */
  remoteGains(): Map<number, GainNode>;
}

const AUDIO_NOTICE_GROUP = "audio";
/** Peak level of a cue at full notification and output volume. */
const NOTIFICATION_PEAK = 0.4;

/** The output side of the audio graph, covering the shared AudioContext, speaker sink, output volume, the audio notices,
 *  notification sounds and the native WebRTC playback element. The context and the element are non-reactive closure state,
 *  never in Pinia. */
export function useAudioOutput(deps: AudioOutputDeps) {
  const session = useSessionStore();
  const audio = useVoiceAudioStore();
  const { outputVolume, outputMuted, notificationVolume, selectedOutputDeviceId, outputDeviceSupported, audioContextState } =
    storeToRefs(audio);
  const { outputDevices } = audio;

  let audioCtx: SinkAudioContext | null = null;
  let webrtcOutputElement: SinkAudioElement | null = null;
  let webrtcPlaybackStream: MediaStream | null = null;
  let webrtcPlaybackRetryCleanup: (() => void) | null = null;

  function effectiveOutputVolume(): number {
    return outputMuted.value ? 0 : outputVolume.value;
  }

  function applyOutputVolume(): void {
    const level = effectiveOutputVolume();
    for (const [clientId, gain] of deps.remoteGains()) gain.gain.value = audio.memberGain(clientId) * level;
    if (webrtcOutputElement) webrtcOutputElement.volume = level;
  }

  function getAudioCtx(): SinkAudioContext {
    if (!audioCtx) {
      audioCtx = new AudioContext({ sampleRate: 48000 }) as SinkAudioContext;
      audioContextState.value = audioCtx.state;
      audioCtx.addEventListener("statechange", () => {
        if (audioCtx) audioContextState.value = audioCtx.state;
      });
      outputDeviceSupported.value =
        typeof audioCtx.setSinkId === "function" || typeof (HTMLMediaElement.prototype as SinkAudioElement).setSinkId === "function";
      if (selectedOutputDeviceId.value && outputDeviceSupported.value) {
        void setAudioSink(audioCtx, selectedOutputDeviceId.value).catch(() => undefined);
      }
    }
    return audioCtx;
  }

  /** The context if one was created, without creating it. */
  function existingAudioCtx(): SinkAudioContext | null {
    return audioCtx;
  }

  /** Close and forget the context. */
  function releaseAudioCtx(): void {
    void audioCtx?.close();
    audioCtx = null;
  }

  /** Hand the native WebRTC playback element and its stream to this module (the transport's `ontrack`). */
  function attachWebRtcPlayback(output: SinkAudioElement, stream: MediaStream): void {
    webrtcOutputElement = output;
    webrtcPlaybackStream = stream;
  }

  /** Non-fatal audio notice (WebRTC fallback, blocked autoplay, device list failure...). */
  function setAudioNotice(code: string, params?: TextParams): void {
    const noticeCode = safeClientErrorCode(code) || "AUDIO_NOTICE";
    session.setRoomNotice({
      code: noticeCode,
      text: audioNoticeText(noticeCode, params),
      title: text("audioStatus"),
      variant: noticeCode === "VOICE_CONNECTING" ? "info" : noticeCode === "VOICE_FAILED" ? "danger" : "warning",
      group: AUDIO_NOTICE_GROUP,
    });
  }

  function clearAudioNotice(code?: string): void {
    if (code) session.clearRoomNotice(safeClientErrorCode(code));
    else session.clearRoomNotice(undefined, AUDIO_NOTICE_GROUP);
  }

  /** A suspended AudioContext silently swallows capture, so say so instead of pretending. */
  function syncAudioContextNotice(): void {
    if (audioCtx && audioCtx.state === "suspended") {
      setAudioNotice("AUDIO_CONTEXT_SUSPENDED");
    } else {
      clearAudioNotice("AUDIO_CONTEXT_SUSPENDED");
    }
  }

  async function setAudioSink(ctx: SinkAudioContext, deviceId: string): Promise<void> {
    const mediaSinkSupported = typeof (HTMLMediaElement.prototype as SinkAudioElement).setSinkId === "function";
    if (!ctx.setSinkId && !mediaSinkSupported) {
      outputDeviceSupported.value = false;
      if (deviceId) throw new LocalizedError(text("speakerSelectionUnsupported"), "SPEAKER_SELECTION_UNSUPPORTED");
      return;
    }
    outputDeviceSupported.value = true;
    if (ctx.setSinkId) await ctx.setSinkId(deviceId || "default");
    if (webrtcOutputElement?.setSinkId) await webrtcOutputElement.setSinkId(deviceId || "default");
  }

  async function setOutputDevice(deviceId: string): Promise<void> {
    const previousDeviceId = selectedOutputDeviceId.value;
    if (deviceId && !outputDevices.some((device) => device.deviceId === deviceId)) {
      throw new LocalizedError(text("speakerUnavailable"), "SPEAKER_UNAVAILABLE");
    }
    selectedOutputDeviceId.value = deviceId;
    writeStorage("webspeak:output-device", deviceId);
    try {
      await setAudioSink(getAudioCtx(), deviceId);
      await deps.saveAudioPreferences();
    } catch (error) {
      selectedOutputDeviceId.value = previousDeviceId;
      writeStorage("webspeak:output-device", previousDeviceId);
      throw error;
    }
  }

  function installWebRtcPlaybackRetry(): void {
    if (webrtcPlaybackRetryCleanup) return;
    const retry = () => {
      void syncWebRtcPlayback();
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "touchstart", "keydown"];
    for (const event of events) window.addEventListener(event, retry, { passive: true });
    document.addEventListener("visibilitychange", retry, { passive: true });
    webrtcPlaybackRetryCleanup = () => {
      for (const event of events) window.removeEventListener(event, retry);
      document.removeEventListener("visibilitychange", retry);
      webrtcPlaybackRetryCleanup = null;
    };
  }

  async function syncWebRtcPlayback(): Promise<void> {
    const output = webrtcOutputElement;
    if (!output || !webrtcPlaybackStream) return;
    // Keep WebRTC on the browser's native MediaStream playback path. Routing it through the capture AudioContext could leave
    // the UI reporting a live speaker while the remote audio element stayed muted.
    output.muted = false;
    if (audioCtx && audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {
        /* a user gesture is still required */
      }
    }
    try {
      await output.play();
      webrtcPlaybackRetryCleanup?.();
      clearAudioNotice("PLAYBACK_BLOCKED");
      syncAudioContextNotice();
    } catch {
      // Mobile and privacy-focused browsers can demand a gesture even for a MediaStream. Retry after the next real interaction
      // and tell the user why the remote audio is missing instead of staying silent.
      setAudioNotice("PLAYBACK_BLOCKED");
      installWebRtcPlaybackRetry();
    }
  }

  function stopWebRtcPlayback(): void {
    webrtcPlaybackRetryCleanup?.();
    webrtcPlaybackStream = null;
    webrtcOutputElement?.pause();
    if (webrtcOutputElement) {
      webrtcOutputElement.srcObject = null;
      webrtcOutputElement.remove();
    }
    webrtcOutputElement = null;
  }

  function playNotification(kind: NotificationSound): void {
    if (notificationVolume.value <= 0 || outputMuted.value || effectiveOutputVolume() <= 0 || typeof window === "undefined") return;
    try {
      const ctx = getAudioCtx();
      const volume = notificationVolume.value * effectiveOutputVolume() * NOTIFICATION_PEAK;
      if (ctx.state !== "suspended") {
        playNotificationSound(ctx, kind, volume);
        return;
      }
      // The browser may still allow a resume after an earlier gesture, otherwise the cue is skipped rather than played late.
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === "running") playNotificationSound(ctx, kind, volume);
        })
        .catch(() => undefined);
    } catch {
      // Notification sounds are best effort and must never affect the session.
    }
  }

  const handlers: MessageHandlers = {
    audioError: (msg) => {
      // The gateway could not encode our microphone audio (its Opus encoder is unavailable), so say it instead of dropping
      // frames silently.
      const audioCode = safeClientErrorCode(msg.code) || "AUDIO_ERROR";
      const detail = safeClientErrorDetail(msg.detail);
      setAudioNotice(audioCode, detail ? { detail } : undefined);
    },
  };

  return {
    handlers,
    effectiveOutputVolume,
    applyOutputVolume,
    getAudioCtx,
    existingAudioCtx,
    releaseAudioCtx,
    attachWebRtcPlayback,
    setAudioNotice,
    clearAudioNotice,
    syncAudioContextNotice,
    setAudioSink,
    setOutputDevice,
    syncWebRtcPlayback,
    stopWebRtcPlayback,
    playNotification,
  };
}
