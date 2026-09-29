import { storeToRefs } from "pinia";
import { writeStorage } from "@/lib/safe-storage";
import { useVoiceAudioStore } from "../../stores/voiceAudio";
import { useVoiceSessionStore } from "../../stores/voiceSession";
import { safeClientErrorCode, safeClientErrorDetail } from "./errors";
import type { SinkAudioContext, SinkAudioElement } from "./types";
import type { MessageHandlers } from "./message-router";

/** Late-bound pieces owned by other modules (V-D2): the assembler passes them in, this module never imports them. */
export interface AudioOutputDeps {
  saveAudioPreferences(): Promise<void>;
  /** The per-client playback gain nodes; they live with the downlink playback and are resolved at call time. */
  remoteGains(): Map<number, GainNode>;
}

/** The output side of the audio graph: the shared AudioContext, the speaker sink, output volume,
 *  the audio notice slot, notification sounds and the native WebRTC playback element. The
 *  AudioContext and the playback element are non-reactive closure state, never stored in Pinia. */
export function useAudioOutput(deps: AudioOutputDeps) {
  const session = useVoiceSessionStore();
  const { state } = session;
  const audio = useVoiceAudioStore();
  const {
    outputVolume, outputMuted, notificationVolume, selectedOutputDeviceId, outputDeviceSupported, audioContextState,
  } = storeToRefs(audio);
  const { outputDevices, volumes } = audio;

  let audioCtx: SinkAudioContext | null = null;
  let webrtcOutputElement: SinkAudioElement | null = null;
  let webrtcPlaybackStream: MediaStream | null = null;
  let webrtcPlaybackRetryCleanup: (() => void) | null = null;

  function effectiveOutputVolume(): number {
    return outputMuted.value ? 0 : outputVolume.value;
  }

  function applyOutputVolume(): void {
    const level = effectiveOutputVolume();
    for (const [clientId, gain] of deps.remoteGains()) gain.gain.value = (volumes[clientId] ?? 1) * level;
    if (webrtcOutputElement) webrtcOutputElement.volume = level;
  }

  function getAudioCtx(): SinkAudioContext {
    if (!audioCtx) {
      audioCtx = new AudioContext({ sampleRate: 48000 }) as SinkAudioContext;
      audioContextState.value = audioCtx.state;
      audioCtx.addEventListener("statechange", () => {
        if (audioCtx) audioContextState.value = audioCtx.state;
      });
      outputDeviceSupported.value = typeof audioCtx.setSinkId === "function"
        || typeof (HTMLMediaElement.prototype as SinkAudioElement).setSinkId === "function";
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

  /** Close and forget the context (microphone teardown, until the capture graph moves). */
  function releaseAudioCtx(): void {
    audioCtx?.close();
    audioCtx = null;
  }

  /** Hand the native WebRTC playback element and its stream to this module (the transport's `ontrack`). */
  function attachWebRtcPlayback(output: SinkAudioElement, stream: MediaStream): void {
    webrtcOutputElement = output;
    webrtcPlaybackStream = stream;
  }

  /** Non-fatal audio notice (WebRTC fallback, blocked autoplay, device list failure...). */
  function setAudioNotice(code: string, message: string): void {
    state.audioNoticeCode = safeClientErrorCode(code) || "AUDIO_NOTICE";
    state.audioNotice = message;
  }

  function clearAudioNotice(code?: string): void {
    if (code && state.audioNoticeCode !== safeClientErrorCode(code)) return;
    state.audioNotice = "";
    state.audioNoticeCode = "";
  }

  /** A suspended AudioContext silently swallows capture: say so instead of pretending. */
  function syncAudioContextNotice(): void {
    if (audioCtx && audioCtx.state === "suspended") {
      setAudioNotice("AUDIO_CONTEXT_SUSPENDED", "浏览器的音频处理被暂停（需要一次页面交互），麦克风与扬声器可能无声：请点击页面任意位置后重试");
    } else {
      clearAudioNotice("AUDIO_CONTEXT_SUSPENDED");
    }
  }

  function audioNoticeMessage(code: string, detail?: unknown): string {
    const detailText = safeClientErrorDetail(detail);
    if (code === "AUDIO_ENCODER_UNAVAILABLE") {
      return `麦克风声音未能发送：语音网关的音频编码器不可用（错误代码：${code}）${detailText ? `：${detailText}` : ""}，请联系管理员`;
    }
    return `音频链路异常（错误代码：${code}）${detailText ? `：${detailText}` : ""}，麦克风声音可能没有发送给其他成员`;
  }

  async function setAudioSink(ctx: SinkAudioContext, deviceId: string): Promise<void> {
    const mediaSinkSupported = typeof (HTMLMediaElement.prototype as SinkAudioElement).setSinkId === "function";
    if (!ctx.setSinkId && !mediaSinkSupported) {
      outputDeviceSupported.value = false;
      if (deviceId) throw new Error("当前浏览器不支持扬声器设备选择，将使用默认输出设备");
      return;
    }
    outputDeviceSupported.value = true;
    if (ctx.setSinkId) await ctx.setSinkId(deviceId || "default");
    if (webrtcOutputElement?.setSinkId) await webrtcOutputElement.setSinkId(deviceId || "default");
  }

  async function setOutputDevice(deviceId: string): Promise<void> {
    const previousDeviceId = selectedOutputDeviceId.value;
    if (deviceId && !outputDevices.some((device) => device.deviceId === deviceId)) {
      throw new Error("所选扬声器当前不可用");
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
    const retry = () => { void syncWebRtcPlayback(); };
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
    // Keep WebRTC on the browser's native MediaStream playback path. The
    // capture AudioContext is intentionally not used as a second output
    // route: a running-but-silent graph could leave the UI reporting a live
    // speaker while the actual remote audio element remained muted.
    output.muted = false;
    if (audioCtx && audioCtx.state === "suspended") {
      try { await audioCtx.resume(); } catch { /* a user gesture is still required */ }
    }
    try {
      await output.play();
      webrtcPlaybackRetryCleanup?.();
      clearAudioNotice("PLAYBACK_BLOCKED");
      syncAudioContextNotice();
    } catch {
      // Mobile and privacy-focused browsers can require a gesture even for a
      // MediaStream. Keep retrying after the next real interaction, but tell the
      // user why the remote audio is missing instead of staying silent.
      setAudioNotice("PLAYBACK_BLOCKED", "浏览器阻止了音频自动播放，暂时听不到其他成员的声音：请点击页面任意位置，或在地址栏允许本站播放声音");
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

  function playNotification(kind: "connected" | "disconnected" | "poke" | "private" | "reconnectFailed"): void {
    if (notificationVolume.value <= 0 || outputMuted.value || effectiveOutputVolume() <= 0 || typeof window === "undefined") return;
    try {
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") return;
      const frequencies: Record<typeof kind, number[]> = {
        connected: [660, 880],
        disconnected: [440, 330],
        poke: [740, 980],
        private: [600, 760],
        reconnectFailed: [300, 220],
      };
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      oscillator.frequency.setValueAtTime(frequencies[kind][0], now);
      oscillator.frequency.setValueAtTime(frequencies[kind][1], now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, notificationVolume.value * effectiveOutputVolume() * 0.12), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
    } catch {
      // Notification sounds are best effort and must never affect the session.
    }
  }

  const handlers: MessageHandlers = {
    audioError: (msg: any) => {
      // The gateway could not encode our microphone audio (for example its Opus
      // encoder is unavailable): say it instead of dropping frames silently.
      const audioCode = safeClientErrorCode(msg.code) || "AUDIO_ERROR";
      setAudioNotice(audioCode, audioNoticeMessage(audioCode, msg.detail));
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
    audioNoticeMessage,
    setAudioSink,
    setOutputDevice,
    syncWebRtcPlayback,
    stopWebRtcPlayback,
    playNotification,
  };
}
