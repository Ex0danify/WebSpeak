import type { Ref } from "vue";
import { storeToRefs } from "pinia";
import type { RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import { useVoiceAudioStore } from "../stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import { AUDIO_FRAME_SAMPLES, MAX_AUDIO_BUFFERED_BYTES, micCaptureWorkletUrl } from "../audioConstants";
import { text, type LocalizedText, type TextParams } from "@/shared/i18n/localizedText";
import { normalizeMicrophoneFailure } from "../voiceErrors";
import type { SinkAudioContext } from "../voiceTypes";
import { useAudioInputDevices } from "./useAudioInputDevices";
import { createMicrophoneProcessing } from "./microphoneProcessing";
import { useMicrophoneTest } from "./useMicrophoneTest";

/** Late-bound pieces owned by other modules, resolved at call time. */
export interface MicrophoneDeps {
  saveAudioPreferences(): Promise<void>;
  setAudioNotice(code: string, params?: TextParams): void;
  clearAudioNotice(code?: string): void;
  existingAudioCtx(): SinkAudioContext | null;
  setAudioSink(ctx: SinkAudioContext, deviceId: string): Promise<void>;
  getAudioCtx(): SinkAudioContext;
  syncAudioContextNotice(): void;
  releaseAudioCtx(): void;
  markSpeaking(clientId: number): void;
  clearSpeaking(clientId: number): void;
  /** Resolves once the gateway completed the command, rejects when it refuses or stays silent. */
  sendCommand(type: string, payload: Record<string, unknown>): Promise<void>;
  /** The transport's flag, PCM is not sent over the WebSocket while WebRTC carries the microphone. */
  webrtcActive: Ref<boolean>;
  /** The last microphone level of the capture chunk or the WebRTC mic monitor, the assembler owns the ref (it is public). */
  micLevel: Ref<number>;
  webrtcMixMicGain(): GainNode | null;
  releaseAccompanimentStream(): void;
  stopWebRtcMix(): void;
  connectionSequence(): number;
  stopWebRtcTransport(): void;
  startWebRtcTransport(sequence: number, socket: WebSocket): Promise<void>;
}

/** The microphone: support check, constraints, the capture graph, the PCM frame assembler, mute and noise suppression. Stream,
 *  audio nodes and frame buffers are non-reactive closure state, never in Pinia. Device lists, RNNoise/VOX and the mic test
 *  live in siblings. */
export function useMicrophone(deps: MicrophoneDeps) {
  const session = useSessionStore();
  const { ws } = storeToRefs(session);
  const { state } = session;
  const audio = useVoiceAudioStore();
  const { microphoneMuted, noiseSuppressionEnabled, inputVolume, selectedInputDeviceId, audioPermission, microphoneTestActive } =
    storeToRefs(audio);
  const { microphoneProcessing } = audio;
  const { webrtcActive, micLevel } = deps;

  let micStream: MediaStream | null = null;
  let scriptNode: ScriptProcessorNode | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let workletContext: AudioContext | null = null;
  let workletModulePromise: Promise<void> | null = null;
  let rnnoiseNode: RnnoiseWorkletNode | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;
  let micGain: GainNode | null = null;
  let silentGain: GainNode | null = null;
  let processedMicDestination: MediaStreamAudioDestinationNode | null = null;
  let microphoneStartPromise: Promise<void> | null = null;
  let convBuf = new Int16Array(1024);
  let accumBuf = new Int16Array(2048);
  let accumLen = 0;

  const processing = createMicrophoneProcessing();
  const devices = useAudioInputDevices(deps, { isOpen: () => micStream !== null, startMicrophone: () => startMicrophone() });
  const { refreshAudioDevices, refreshInputDevices, prepareInputDevices, setInputDevice } = devices;

  function checkSupport(): LocalizedText | null {
    if (typeof window === "undefined") return null;
    if (!window.isSecureContext) return text("voiceNeedsHttps");
    if (!navigator.mediaDevices?.getUserMedia) return text("microphoneUnsupported");
    if (typeof AudioContext === "undefined") return text("webAudioUnsupported");
    if (typeof AudioDecoder === "undefined") return text("audioDecodingUnsupported");
    return null;
  }

  function microphoneConstraints(): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: noiseSuppressionEnabled.value,
      // Keep the microphone's natural dynamics, browser AGC makes speech pump in volume while background noise changes.
      autoGainControl: false,
    };
    if (selectedInputDeviceId.value) constraints.deviceId = { exact: selectedInputDeviceId.value };
    return constraints;
  }

  /**
   * Microphone failures are a degraded state, not a connection failure. The room stays joined, so they get their own slot
   * instead of taking over `error`.
   */
  function setMicrophoneError(error: unknown): LocalizedText {
    const failure = normalizeMicrophoneFailure(error);
    state.microphoneErrorCode = failure.code;
    state.microphoneError = failure.text;
    return failure.text;
  }

  function clearMicrophoneError(): void {
    state.microphoneError = "";
    state.microphoneErrorCode = "";
  }

  /** A saved device that is unplugged fails an exact constraint; forget it and take the default microphone instead. */
  async function acquireStream(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints() });
    } catch (error) {
      const deviceGone = error instanceof DOMException && ["OverconstrainedError", "NotFoundError"].includes(error.name);
      if (!deviceGone || !selectedInputDeviceId.value) throw error;
      selectedInputDeviceId.value = "";
      return navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints() });
    }
  }

  async function startMicrophone(): Promise<void> {
    const ctx = deps.getAudioCtx();
    // Acquire the replacement stream before tearing down the current graph, so a failed device change keeps the mic running.
    let nextStream: MediaStream;
    try {
      nextStream = await acquireStream();
      audioPermission.value = "granted";
      clearMicrophoneError();
    } catch (error) {
      if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) audioPermission.value = "denied";
      // Never let the raw DOMException (usually an English message) reach the UI, record a readable failure first.
      setMicrophoneError(error);
      throw error;
    }
    // Resume only after the stream is in hand: a resume that waits for a user gesture would otherwise keep the
    // permission prompt from ever appearing.
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* the audio context notice explains the silence */
      }
    }
    const microphoneTrack = nextStream.getAudioTracks()[0];
    const settings = microphoneTrack?.getSettings();
    microphoneProcessing.echoCancellation = typeof settings?.echoCancellation === "boolean" ? settings.echoCancellation : null;
    microphoneProcessing.noiseSuppression = typeof settings?.noiseSuppression === "boolean" ? settings.noiseSuppression : null;
    microphoneProcessing.autoGainControl = typeof settings?.autoGainControl === "boolean" ? settings.autoGainControl : null;
    stopMicrophone(false);
    micStream = nextStream;

    micSource = ctx.createMediaStreamSource(micStream);
    rnnoiseNode = noiseSuppressionEnabled.value ? await processing.createRnnoiseNode(ctx) : null;
    if (!noiseSuppressionEnabled.value) microphoneProcessing.rnnoise = false;
    const processedSource: AudioNode = rnnoiseNode ?? micSource;
    if (rnnoiseNode) micSource.connect(rnnoiseNode);
    processedMicDestination = ctx.createMediaStreamDestination();
    processedMicDestination.channelCount = 1;
    processedMicDestination.channelCountMode = "explicit";
    processedSource.connect(processedMicDestination);
    micGain = ctx.createGain();
    micGain.gain.value = inputVolume.value;
    silentGain = ctx.createGain();
    silentGain.gain.value = 0;

    const handleCaptureChunk = (input: Float32Array, rms?: number): void => {
      if (!input.length) return;
      micLevel.value = Math.min(1, (rms ?? Math.sqrt(input.reduce((sum, sample) => sum + sample * sample, 0) / input.length)) * 6);
      const socket = ws.value;
      const shouldSend =
        !microphoneMuted.value &&
        !microphoneTestActive.value &&
        !webrtcActive.value &&
        socket?.readyState === WebSocket.OPEN &&
        processing.voxGate(input);
      if (!shouldSend) {
        accumLen = 0;
        if (microphoneMuted.value) processing.resetVox();
        return;
      }
      if (!socket) {
        accumLen = 0;
        return;
      }
      const bufferedBytes = socket.bufferedAmount;
      if (bufferedBytes > MAX_AUDIO_BUFFERED_BYTES) {
        accumLen = 0;
        return;
      }

      if (convBuf.length < input.length) convBuf = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const sample = Math.max(-1, Math.min(1, input[i]!));
        convBuf[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      const need = accumLen + input.length;
      if (accumBuf.length < need) accumBuf = new Int16Array(Math.max(need, accumBuf.length * 2));
      accumBuf.set(convBuf.subarray(0, input.length), accumLen);
      accumLen = need;

      let offset = 0;
      while (
        offset + AUDIO_FRAME_SAMPLES <= accumLen &&
        socket.readyState === WebSocket.OPEN &&
        socket.bufferedAmount <= MAX_AUDIO_BUFFERED_BYTES
      ) {
        socket.send(accumBuf.slice(offset, offset + AUDIO_FRAME_SAMPLES).buffer);
        offset += AUDIO_FRAME_SAMPLES;
      }
      if (offset > 0) deps.markSpeaking(state.tsClientId);
      accumLen -= offset;
      if (offset > 0) accumBuf.set(accumBuf.subarray(offset, offset + accumLen), 0);
    };

    if (typeof AudioWorkletNode !== "undefined" && ctx.audioWorklet) {
      try {
        if (workletContext !== ctx || !workletModulePromise) {
          workletContext = ctx;
          workletModulePromise = ctx.audioWorklet.addModule(micCaptureWorkletUrl);
        }
        await workletModulePromise;
        workletNode = new AudioWorkletNode(ctx, "webspeak-mic-capture", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        workletNode.port.onmessage = (event: MessageEvent<{ samples?: Float32Array; rms?: number }>) => {
          const samples = event.data?.samples;
          if (samples instanceof Float32Array) handleCaptureChunk(samples, event.data.rms);
        };
      } catch {
        workletNode?.disconnect();
        workletNode = null;
        workletContext = null;
        workletModulePromise = null;
      }
    }

    if (!workletNode) {
      scriptNode = ctx.createScriptProcessor(1024, 1, 1);
      scriptNode.onaudioprocess = (event) => handleCaptureChunk(event.inputBuffer.getChannelData(0));
    }

    processedSource.connect(micGain);
    const captureNode = workletNode ?? scriptNode!;
    micGain.connect(captureNode);
    captureNode.connect(silentGain);
    silentGain.connect(ctx.destination);
    await refreshAudioDevices();
    deps.syncAudioContextNotice();
  }

  // Exported to RoomView, await this before enabling the microphone so a failed capture is never reported as success
  async function ensureMicrophone(): Promise<void> {
    if (micStream) return;
    if (!microphoneStartPromise) {
      microphoneStartPromise = startMicrophone().finally(() => {
        microphoneStartPromise = null;
      });
    }
    await microphoneStartPromise;
  }

  function stopCaptureGraph(): void {
    accumLen = 0;
    processing.resetVox();
    micLevel.value = 0;
    scriptNode?.disconnect();
    workletNode?.port.close();
    workletNode?.disconnect();
    micGain?.disconnect();
    silentGain?.disconnect();
    scriptNode = null;
    workletNode = null;
    micGain = null;
    silentGain = null;
  }

  function stopMicrophoneProcessingGraph(): void {
    rnnoiseNode?.destroy();
    rnnoiseNode?.disconnect();
    rnnoiseNode = null;
    micSource?.disconnect();
    processedMicDestination?.disconnect();
    processedMicDestination?.stream.getTracks().forEach((track) => track.stop());
    micSource = null;
    processedMicDestination = null;
  }

  function stopMicrophone(closeContext = true): void {
    stopCaptureGraph();
    stopMicrophoneProcessingGraph();
    deps.releaseAccompanimentStream();
    deps.stopWebRtcMix();
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
    if (closeContext) {
      deps.releaseAudioCtx();
      workletContext = null;
      workletModulePromise = null;
      processing.forgetRnnoiseWorkletModule();
    }
  }

  /** The local mute takes effect at once and stays when the gateway refuses it, so a failed sync never opens the microphone. */
  function setMicrophoneMuted(muted: boolean): Promise<void> {
    microphoneMuted.value = muted;
    processing.resetVox();
    accumLen = 0;
    if (webrtcActive.value)
      micStream?.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    const mixMicGain = deps.webrtcMixMicGain();
    if (mixMicGain) mixMicGain.gain.value = muted ? 0 : inputVolume.value;
    const synced = deps.sendCommand("setMicrophoneMuted", { muted });
    if (muted && state.tsClientId) deps.clearSpeaking(state.tsClientId);
    void deps.saveAudioPreferences();
    return synced;
  }

  async function setNoiseSuppressionEnabled(enabled: boolean): Promise<void> {
    if (noiseSuppressionEnabled.value === enabled) return;
    const shouldRestartWebRtc = webrtcActive.value && Boolean(ws.value);
    noiseSuppressionEnabled.value = enabled;
    void deps.saveAudioPreferences();
    if (!micStream) return;
    try {
      if (shouldRestartWebRtc) deps.stopWebRtcTransport();
      await startMicrophone();
      if (shouldRestartWebRtc && ws.value) await deps.startWebRtcTransport(deps.connectionSequence(), ws.value);
    } catch (error) {
      setMicrophoneError(error);
    }
  }

  /** The open microphone stream, if any (the WebRTC transport and the mic test read it until they move). */
  function getMicStream(): MediaStream | null {
    return micStream;
  }

  /** The stream the transport should send: the processed destination when there is one. */
  function getProcessedMicStream(): MediaStream | null {
    return processedMicDestination?.stream ?? micStream;
  }

  /** The mic gain line of `applyInputVolume`. */
  function applyMicGain(): void {
    if (micGain) micGain.gain.value = inputVolume.value;
  }

  const test = useMicrophoneTest({ prepareInputDevices, getMicStream, stopMicrophone });

  return {
    checkSupport,
    microphoneConstraints,
    refreshAudioDevices,
    refreshInputDevices,
    prepareInputDevices,
    setInputDevice,
    setMicrophoneError,
    clearMicrophoneError,
    startMicrophone,
    ensureMicrophone,
    stopMicrophone,
    stopCaptureGraph,
    setMicrophoneMuted,
    setNoiseSuppressionEnabled,
    startMicrophoneTest: test.startMicrophoneTest,
    stopMicrophoneTest: test.stopMicrophoneTest,
    getMicStream,
    getProcessedMicStream,
    applyMicGain,
  };
}
