import type { Ref } from "vue";
import { storeToRefs } from "pinia";
import { RnnoiseWorkletNode, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import { writeStorage } from "@/lib/safe-storage";
import { useVoiceAudioStore } from "../../stores/voiceAudio";
import { useVoiceSessionStore } from "../../stores/voiceSession";
import {
  AUDIO_FRAME_SAMPLES,
  MAX_AUDIO_BUFFERED_BYTES,
  VOX_ATTACK_FRAMES,
  VOX_HOLD,
  micCaptureWorkletUrl,
} from "./audio-constants";
import { normalizeMicrophoneFailure } from "./errors";
import type { SinkAudioContext } from "./types";

/** Late-bound pieces owned by other modules or still in the assembler (V-D2): resolved at call time. */
export interface MicrophoneDeps {
  saveAudioPreferences(): Promise<void>;
  setAudioNotice(code: string, message: string): void;
  clearAudioNotice(code?: string): void;
  existingAudioCtx(): SinkAudioContext | null;
  setAudioSink(ctx: SinkAudioContext, deviceId: string): Promise<void>;
  getAudioCtx(): SinkAudioContext;
  syncAudioContextNotice(): void;
  releaseAudioCtx(): void;
  markSpeaking(clientId: number): void;
  clearSpeaking(clientId: number): void;
  sendCmd(type: string, payload?: Record<string, unknown>): void;
  /** The transport's flag: PCM is not sent over the WebSocket while WebRTC carries the microphone. */
  webrtcActive: Ref<boolean>;
  /** The last microphone level of the capture chunk or the WebRTC mic monitor; the assembler owns the ref (it is public). */
  micLevel: Ref<number>;
  webrtcMixMicGain(): GainNode | null;
  releaseAccompanimentStream(): void;
  stopWebRtcMix(): void;
  connectionSequence(): number;
  stopWebRtcTransport(): void;
  startWebRtcTransport(sequence: number, socket: WebSocket): Promise<void>;
}

/** The microphone: support check, constraints, device lists, the capture graph with VOX and the PCM
 *  frame assembler, mute and noise suppression. The stream, the audio nodes and the frame buffers are
 *  non-reactive closure state, never stored in Pinia. and the microphone test. */
export function useMicrophone(deps: MicrophoneDeps) {
  const session = useVoiceSessionStore();
  const { ws } = storeToRefs(session);
  const { state } = session;
  const audio = useVoiceAudioStore();
  const {
    microphoneMuted, noiseSuppressionEnabled, inputVolume, voxThreshold, selectedInputDeviceId, selectedOutputDeviceId,
    outputDeviceSupported, audioPermission, microphoneTestActive, testAudioUrl,
  } = storeToRefs(audio);
  const { inputDevices, outputDevices, microphoneProcessing } = audio;
  const { webrtcActive, micLevel } = deps;

  let micStream: MediaStream | null = null;
  let scriptNode: ScriptProcessorNode | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let workletContext: AudioContext | null = null;
  let workletModulePromise: Promise<void> | null = null;
  let rnnoiseNode: RnnoiseWorkletNode | null = null;
  let rnnoiseWorkletModulePromise: Promise<void> | null = null;
  let rnnoiseWasmPromise: Promise<ArrayBuffer> | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;
  let micGain: GainNode | null = null;
  let silentGain: GainNode | null = null;
  let processedMicDestination: MediaStreamAudioDestinationNode | null = null;
  let microphoneStartPromise: Promise<void> | null = null;
  let testRecorder: MediaRecorder | null = null;
  let testRecorderTimer: ReturnType<typeof setTimeout> | null = null;
  let voxAttack = 0;
  let voxRelease = 0;
  let convBuf = new Int16Array(1024);
  let accumBuf = new Int16Array(2048);
  let accumLen = 0;

  function checkSupport(): string | null {
    if (typeof window === "undefined") return null;
    if (!window.isSecureContext) return "语音功能需要 HTTPS 安全连接";
    if (!navigator.mediaDevices?.getUserMedia) return "当前浏览器不支持麦克风访问";
    if (typeof AudioContext === "undefined") return "当前浏览器不支持 Web Audio 音频处理";
    if (typeof AudioDecoder === "undefined") return "当前浏览器不支持音频解码，请使用最新版 Chrome 或 Edge";
    return null;
  }

  function microphoneConstraints(): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: noiseSuppressionEnabled.value,
      // Keep the microphone's natural dynamics. Browser AGC can make speech
      // pump in volume, especially while background noise changes.
      autoGainControl: false,
    };
    if (selectedInputDeviceId.value) constraints.deviceId = { exact: selectedInputDeviceId.value };
    return constraints;
  }

  async function refreshAudioDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      inputDevices.length = 0;
      outputDevices.length = 0;
      deps.setAudioNotice("DEVICE_LIST_UNAVAILABLE", "无法读取音频设备列表，将使用浏览器默认音频设备：请在系统或浏览器隐私设置中允许读取设备信息");
      return;
    }
    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
      deps.clearAudioNotice("DEVICE_LIST_UNAVAILABLE");
    } catch {
      // enumerateDevices rejects when the device list is blocked (for example in a
      // locked-down iframe). Use the browser defaults and explain the limitation.
      inputDevices.length = 0;
      outputDevices.length = 0;
      deps.setAudioNotice("DEVICE_LIST_UNAVAILABLE", "无法读取音频设备列表，将使用浏览器默认音频设备：请在系统或浏览器隐私设置中允许读取设备信息");
      return;
    }
    const microphones = devices
      .filter((device) => device.kind === "audioinput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label, groupId: device.groupId }));
    const speakers = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label, groupId: device.groupId }));
    inputDevices.splice(0, inputDevices.length, ...microphones);
    outputDevices.splice(0, outputDevices.length, ...speakers);
    if (selectedInputDeviceId.value && !microphones.some((device) => device.deviceId === selectedInputDeviceId.value)) {
      selectedInputDeviceId.value = "";
      writeStorage("webspeak:input-device", selectedInputDeviceId.value);
      void deps.saveAudioPreferences();
      if (micStream) void startMicrophone().catch(() => undefined);
    }
    if (selectedOutputDeviceId.value && !speakers.some((device) => device.deviceId === selectedOutputDeviceId.value)) {
      selectedOutputDeviceId.value = "";
      writeStorage("webspeak:output-device", "");
      void deps.saveAudioPreferences();
      const currentAudioCtx = deps.existingAudioCtx();
      if (currentAudioCtx && outputDeviceSupported.value) void deps.setAudioSink(currentAudioCtx, "").catch(() => undefined);
    }
  }

  async function refreshInputDevices(): Promise<void> {
    await refreshAudioDevices();
  }

  async function prepareInputDevices(): Promise<void> {
    if (!micStream) await startMicrophone();
    else await refreshAudioDevices();
  }

  async function setInputDevice(deviceId: string): Promise<void> {
    const previousDeviceId = selectedInputDeviceId.value;
    const shouldRestartWebRtc = webrtcActive.value && Boolean(ws.value);
    selectedInputDeviceId.value = deviceId;
    writeStorage("webspeak:input-device", deviceId);
    void deps.saveAudioPreferences();
    try {
      if (shouldRestartWebRtc) deps.stopWebRtcTransport();
      if (micStream) await startMicrophone();
      if (shouldRestartWebRtc && ws.value) {
        deps.stopWebRtcTransport();
        await deps.startWebRtcTransport(deps.connectionSequence(), ws.value);
      }
      await refreshAudioDevices();
    } catch (error) {
      selectedInputDeviceId.value = previousDeviceId;
      writeStorage("webspeak:input-device", previousDeviceId);
      throw error;
    }
  }

  /**
   * Microphone failures are a degraded state, not a connection failure: the room
   * stays joined, so they get their own slot instead of taking over `error`.
   */
  function setMicrophoneError(error: unknown): string {
    const failure = normalizeMicrophoneFailure(error);
    state.microphoneErrorCode = failure.code;
    state.microphoneError = failure.message;
    return failure.message;
  }

  function clearMicrophoneError(): void {
    state.microphoneError = "";
    state.microphoneErrorCode = "";
  }

  async function createRnnoiseNode(ctx: AudioContext): Promise<RnnoiseWorkletNode | null> {
    if (typeof AudioWorkletNode === "undefined" || !ctx.audioWorklet) {
      microphoneProcessing.rnnoise = false;
      return null;
    }
    try {
      if (!rnnoiseWasmPromise) {
        rnnoiseWasmPromise = loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }).catch((error) => {
          rnnoiseWasmPromise = null;
          throw error;
        });
      }
      if (!rnnoiseWorkletModulePromise) {
        rnnoiseWorkletModulePromise = ctx.audioWorklet.addModule(rnnoiseWorkletUrl).catch((error) => {
          rnnoiseWorkletModulePromise = null;
          throw error;
        });
      }
      const [wasmBinary] = await Promise.all([rnnoiseWasmPromise, rnnoiseWorkletModulePromise]);
      const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
      microphoneProcessing.rnnoise = true;
      return node;
    } catch {
      // Native browser NS remains active as a fallback. RNNoise is an optional
      // enhancement and must never prevent a microphone from starting.
      microphoneProcessing.rnnoise = false;
      return null;
    }
  }

  async function startMicrophone(): Promise<void> {
    const ctx = deps.getAudioCtx();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* the audio context notice explains the silence */ }
    }
    // Acquire the replacement stream before tearing down the current graph so
    // changing devices does not interrupt an active microphone on failure.
    let nextStream: MediaStream;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints() });
      audioPermission.value = "granted";
      clearMicrophoneError();
    } catch (error) {
      if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) audioPermission.value = "denied";
      // Never let the raw DOMException (usually an English message) reach the UI:
      // record a readable failure first, then let the caller decide how to show it.
      setMicrophoneError(error);
      throw error;
    }
    const microphoneTrack = nextStream.getAudioTracks()[0];
    const settings = microphoneTrack?.getSettings();
    microphoneProcessing.echoCancellation = typeof settings?.echoCancellation === "boolean" ? settings.echoCancellation : null;
    microphoneProcessing.noiseSuppression = typeof settings?.noiseSuppression === "boolean" ? settings.noiseSuppression : null;
    microphoneProcessing.autoGainControl = typeof settings?.autoGainControl === "boolean" ? settings.autoGainControl : null;
    stopMicrophone(false);
    micStream = nextStream;

    micSource = ctx.createMediaStreamSource(micStream);
    rnnoiseNode = noiseSuppressionEnabled.value ? await createRnnoiseNode(ctx) : null;
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
      const shouldSend = !microphoneMuted.value
        && !microphoneTestActive.value
        && !webrtcActive.value
        && socket?.readyState === WebSocket.OPEN
        && voxGate(input);
      if (!shouldSend) {
        accumLen = 0;
        if (microphoneMuted.value) {
          voxAttack = 0;
          voxRelease = 0;
        }
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
      while (offset + AUDIO_FRAME_SAMPLES <= accumLen && socket.readyState === WebSocket.OPEN && socket.bufferedAmount <= MAX_AUDIO_BUFFERED_BYTES) {
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

  // 导出给 WebClient：开麦前先 await 此函数完成真实采集，避免出现“假成功”
  async function ensureMicrophone(): Promise<void> {
    if (micStream) return;
    if (!microphoneStartPromise) {
      microphoneStartPromise = startMicrophone().finally(() => {
        microphoneStartPromise = null;
      });
    }
    await microphoneStartPromise;
  }

  function voxGate(samples: Float32Array): boolean {
    let sum = 0;
    const count = Math.min(256, samples.length);
    for (let i = 0; i < count; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / count);
    if (rms >= voxThreshold.value) {
      voxAttack = Math.min(VOX_ATTACK_FRAMES, voxAttack + 1);
      voxRelease = VOX_HOLD;
      return voxAttack >= VOX_ATTACK_FRAMES;
    }
    voxAttack = 0;
    if (voxRelease > 0) {
      voxRelease--;
      return true;
    }
    return false;
  }

  function stopCaptureGraph(): void {
    accumLen = 0;
    voxAttack = 0;
    voxRelease = 0;
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
      rnnoiseWorkletModulePromise = null;
    }
  }

  function setMicrophoneMuted(muted: boolean): void {
    microphoneMuted.value = muted;
    voxAttack = 0;
    voxRelease = 0;
    accumLen = 0;
    if (webrtcActive.value) micStream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    const mixMicGain = deps.webrtcMixMicGain();
    if (mixMicGain) mixMicGain.gain.value = muted ? 0 : inputVolume.value;
    deps.sendCmd("setMicrophoneMuted", { muted });
    if (muted && state.tsClientId) deps.clearSpeaking(state.tsClientId);
    void deps.saveAudioPreferences();
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

  async function startMicrophoneTest(): Promise<void> {
    microphoneTestActive.value = true;
    if (testAudioUrl.value) {
      URL.revokeObjectURL(testAudioUrl.value);
      testAudioUrl.value = "";
    }
    try {
      await prepareInputDevices();
      if (typeof MediaRecorder !== "undefined" && micStream) {
        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(micStream);
        testRecorder = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onstop = () => {
          if (chunks.length) {
            testAudioUrl.value = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
          }
          if (testRecorder === recorder) testRecorder = null;
        };
        recorder.start();
        testRecorderTimer = setTimeout(() => stopMicrophoneTest(), 5_000);
      }
    } catch (error) {
      microphoneTestActive.value = false;
      throw error;
    }
  }

  function stopMicrophoneTest(): void {
    microphoneTestActive.value = false;
    if (testRecorderTimer) clearTimeout(testRecorderTimer);
    testRecorderTimer = null;
    if (testRecorder && testRecorder.state !== "inactive") testRecorder.stop();
    if (!state.connected) stopMicrophone();
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

  return {
    checkSupport, microphoneConstraints, refreshAudioDevices, refreshInputDevices, prepareInputDevices, setInputDevice,
    setMicrophoneError, clearMicrophoneError, startMicrophone, ensureMicrophone, stopMicrophone, stopCaptureGraph, setMicrophoneMuted,
    setNoiseSuppressionEnabled, startMicrophoneTest, stopMicrophoneTest, getMicStream, getProcessedMicStream, applyMicGain,
  };
}
