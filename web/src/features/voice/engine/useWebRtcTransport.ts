import type { Ref } from "vue";
import { storeToRefs } from "pinia";
import { useVoiceAudioStore } from "../stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import { safeClientErrorCode } from "@/features/session";
import type { SinkAudioContext, SinkAudioElement } from "../voiceTypes";
import type { MessageHandlers } from "@/features/session";
import { useWebRtcAccompaniment } from "./useWebRtcAccompaniment";

/** Late-bound pieces owned by other modules or still in the assembler (V-D2): resolved at call time. */
export interface WebRtcTransportDeps {
  // microphone
  getMicStream(): MediaStream | null;
  getProcessedMicStream(): MediaStream | null;
  ensureMicrophone(): Promise<void>;
  startMicrophone(): Promise<void>;
  stopCaptureGraph(): void;
  setMicrophoneError(error: unknown): string;
  // audio output
  getAudioCtx(): SinkAudioContext;
  effectiveOutputVolume(): number;
  stopWebRtcPlayback(): void;
  attachWebRtcPlayback(output: SinkAudioElement, stream: MediaStream): void;
  syncWebRtcPlayback(): Promise<void>;
  setAudioNotice(code: string, message: string): void;
  // downlink, commands
  markSpeaking(clientId: number): void;
  clearSpeaking(clientId: number): void;
  sendCmd(type: string, payload?: Record<string, unknown>): void;
  // connection (the assembler until V6.1)
  connectionSequence(): number;
  hasLastConnection(): boolean;
  /** The transport's flag: PCM is not sent over the WebSocket while WebRTC carries the microphone. */
  webrtcActive: Ref<boolean>;
  /** The microphone level; the assembler owns the ref (it is public) and the capture chunk writes it too. */
  micLevel: Ref<number>;
}

/** The WebRTC voice transport: the peer, the microphone mix stream, the mic monitor, the answer, the
 *  fallback to the PCM WebSocket path and the accompaniment (`useWebRtcAccompaniment`) that joins the mix. The peer, the mix nodes and the monitor are non-reactive
 *  closure state, never stored in Pinia. */
export function useWebRtcTransport(deps: WebRtcTransportDeps) {
  const session = useSessionStore();
  const { ws } = storeToRefs(session);
  const { state } = session;
  const audio = useVoiceAudioStore();
  const {
    microphoneMuted, inputVolume, voxThreshold, selectedOutputDeviceId, accompanimentActive,
  } = storeToRefs(audio);
  const { volumes } = audio;
  const { webrtcActive, micLevel } = deps;

  let webrtcPeer: RTCPeerConnection | null = null;
  let webrtcNegotiationPromise: Promise<void> | null = null;
  let webrtcFallbackStarted = false;
  let webrtcMixDestination: MediaStreamAudioDestinationNode | null = null;
  let webrtcMixMicSource: MediaStreamAudioSourceNode | null = null;
  let webrtcMixMicGain: GainNode | null = null;
  let webrtcMixAccompanimentSource: MediaStreamAudioSourceNode | null = null;
  let webrtcMicMonitorSource: MediaStreamAudioSourceNode | null = null;
  let webrtcMicMonitorAnalyser: AnalyserNode | null = null;
  let webrtcMicMonitorGain: GainNode | null = null;
  let webrtcMicMonitorTimer: ReturnType<typeof setInterval> | null = null;

  function stopWebRtcMix(): void {
    webrtcMixAccompanimentSource?.disconnect();
    webrtcMixMicSource?.disconnect();
    webrtcMixMicGain?.disconnect();
    webrtcMixDestination?.disconnect();
    webrtcMixAccompanimentSource = null;
    webrtcMixMicSource = null;
    webrtcMixMicGain = null;
    webrtcMixDestination = null;
  }

  function createWebRtcMixStream(): MediaStream {
    const micStream = deps.getMicStream();
    if (!micStream) throw new Error("没有可用的麦克风音轨");
    const ctx = deps.getAudioCtx();
    stopWebRtcMix();
    const destination = ctx.createMediaStreamDestination();
    destination.channelCount = 1;
    destination.channelCountMode = "explicit";
    // Use the browser-native processed track plus the browser-side RNNoise
    // graph. Display/application audio is added separately below and never
    // passes through this microphone denoiser.
    const microphoneStream = deps.getProcessedMicStream() ?? micStream;
    const microphoneSource = ctx.createMediaStreamSource(microphoneStream);
    const microphoneGain = ctx.createGain();
    microphoneGain.gain.value = microphoneMuted.value ? 0 : inputVolume.value;
    microphoneSource.connect(microphoneGain);
    microphoneGain.connect(destination);

    webrtcMixDestination = destination;
    webrtcMixMicSource = microphoneSource;
    webrtcMixMicGain = microphoneGain;

    const accompanimentStream = accompaniment.getAccompanimentStream();
    const accompanimentTrack = accompanimentStream?.getAudioTracks()[0];
    if (accompanimentTrack) {
      const accompanimentSource = ctx.createMediaStreamSource(accompanimentStream!);
      // Keep the captured application audio at its source level. Do not add
      // a fixed attenuation/gain node: it makes music sound quieter than the
      // source and encourages later "compensation" steps to pump its volume.
      accompanimentSource.connect(destination);
      webrtcMixAccompanimentSource = accompanimentSource;
    }
    return destination.stream;
  }

  async function replaceWebRtcAudioTrack(): Promise<void> {
    if (!webrtcPeer || !deps.getMicStream()) return;
    const sender = webrtcPeer.getSenders().find((candidate) => candidate.track?.kind === "audio");
    if (!sender) throw new Error("WebRTC 音频轨道尚未就绪");
    const mixedStream = createWebRtcMixStream();
    const mixedTrack = mixedStream.getAudioTracks()[0];
    if (!mixedTrack) throw new Error("混合音频轨道创建失败");
    await sender.replaceTrack(mixedTrack);
  }

  async function startWebRtcTransport(sequence: number, socket: WebSocket): Promise<void> {
    if (typeof RTCPeerConnection === "undefined") throw new Error("当前浏览器不支持 WebRTC");
    await deps.ensureMicrophone();
    const micStream = deps.getMicStream();
    if (sequence !== deps.connectionSequence() || socket.readyState !== WebSocket.OPEN || !micStream) return;
    const microphoneTrack = micStream.getAudioTracks()[0];
    if (!microphoneTrack) throw new Error("没有可用的麦克风音轨");

    deps.stopCaptureGraph();
    const peer = new RTCPeerConnection({ iceServers: [] });
    webrtcPeer = peer;
    webrtcFallbackStarted = false;
    microphoneTrack.enabled = !microphoneMuted.value;
    const mixedStream = createWebRtcMixStream();
    const mixedTrack = mixedStream.getAudioTracks()[0];
    if (!mixedTrack) throw new Error("混合音频轨道创建失败");
    peer.addTrack(mixedTrack, mixedStream);
    peer.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      // Use the browser's native WebRTC media output. Routing the remote
      // track through AudioContext made playback depend on autoplay policy:
      // the control channel could report speaking while a suspended context
      // silently discarded the actual audio. A hidden autoplaying media
      // element keeps WebRTC's decoder and jitter buffer on the native path.
      deps.stopWebRtcPlayback();
      const output = document.createElement("audio") as SinkAudioElement;
      output.autoplay = true;
      output.muted = false;
      output.setAttribute("playsinline", "");
      output.volume = deps.effectiveOutputVolume();
      output.setAttribute("aria-hidden", "true");
      output.tabIndex = -1;
      output.style.position = "fixed";
      output.style.width = "1px";
      output.style.height = "1px";
      output.style.opacity = "0";
      output.style.pointerEvents = "none";
      output.srcObject = stream;
      document.body.append(output);
      deps.attachWebRtcPlayback(output, stream);
      if (selectedOutputDeviceId.value && output.setSinkId) {
        void output.setSinkId(selectedOutputDeviceId.value).catch(() => undefined);
      }
      void deps.syncWebRtcPlayback();
    };
    startWebRtcMicMonitor(deps.getAudioCtx(), micStream, microphoneTrack);
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") void fallbackFromWebRtc(sequence, socket, "WEBRTC_CONNECTION_FAILED");
    };

    const negotiation = (async () => {
      webrtcActive.value = true;
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      if (sequence !== deps.connectionSequence() || webrtcPeer !== peer || socket.readyState !== WebSocket.OPEN) return;
      const description = peer.localDescription;
      if (!description) throw new Error("WebRTC offer was not created");
      socket.send(JSON.stringify({ type: "webrtcOffer", payload: {
        sdp: { type: description.type, sdp: description.sdp },
        muted: microphoneMuted.value,
        accompanimentActive: accompanimentActive.value,
      } }));
      window.setTimeout(() => {
        if (webrtcPeer === peer && !peer.remoteDescription) void fallbackFromWebRtc(sequence, socket, "WEBRTC_ANSWER_TIMEOUT");
      }, 8_000);
    })();
    webrtcNegotiationPromise = negotiation;
    try {
      await negotiation;
    } catch (error) {
      if (webrtcPeer === peer) await fallbackFromWebRtc(sequence, socket, "WEBRTC_NEGOTIATION_FAILED");
      throw error;
    } finally {
      if (webrtcNegotiationPromise === negotiation) webrtcNegotiationPromise = null;
    }
  }

  async function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        peer.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      };
      const onStateChange = () => {
        if (peer.iceGatheringState === "complete") finish();
      };
      const timer = window.setTimeout(finish, 5_000);
      peer.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  async function applyWebRtcAnswer(description: unknown): Promise<void> {
    if (!webrtcPeer || !isSessionDescription(description, "answer")) return;
    try {
      await webrtcPeer.setRemoteDescription(description);
      webrtcActive.value = true;
      syncWebRtcMemberVolumes();
    } catch {
      if (deps.hasLastConnection() && ws.value) await fallbackFromWebRtc(deps.connectionSequence(), ws.value, "WEBRTC_ANSWER_REJECTED");
    }
  }

  async function fallbackFromWebRtc(sequence: number, socket: WebSocket, reasonCode = "WEBRTC_UNAVAILABLE"): Promise<void> {
    if (sequence !== deps.connectionSequence() || webrtcFallbackStarted) return;
    webrtcFallbackStarted = true;
    webrtcActive.value = false;
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "webrtcStop" }));
    stopWebRtcTransport();
    if (socket.readyState === WebSocket.OPEN && state.connected) {
      // Degrading to the compatibility transport must be visible: the user is
      // still connected, but with different latency and audio quality.
      deps.setAudioNotice("WEBRTC_FALLBACK", `实时语音（WebRTC）不可用（错误代码：${safeClientErrorCode(reasonCode) || "WEBRTC_UNAVAILABLE"}），已切换为兼容传输：延迟与音质可能下降`);
      try { await deps.startMicrophone(); } catch (error: unknown) {
        deps.setMicrophoneError(error);
      }
    }
  }

  function stopWebRtcTransport(): void {
    const peer = webrtcPeer;
    webrtcPeer = null;
    webrtcActive.value = false;
    webrtcNegotiationPromise = null;
    accompaniment.releaseAccompanimentStream();
    stopWebRtcMix();
    stopWebRtcMicMonitor();
    deps.stopWebRtcPlayback();
    if (peer) void peer.close();
  }

  function startWebRtcMicMonitor(ctx: AudioContext, stream: MediaStream, track: MediaStreamTrack): void {
    stopWebRtcMicMonitor(false);
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silent);
      silent.connect(ctx.destination);
      const samples = new Float32Array(analyser.fftSize);
      webrtcMicMonitorSource = source;
      webrtcMicMonitorAnalyser = analyser;
      webrtcMicMonitorGain = silent;
      webrtcMicMonitorTimer = setInterval(() => {
        if (!webrtcMicMonitorAnalyser) return;
        webrtcMicMonitorAnalyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const rms = Math.sqrt(sum / samples.length);
        micLevel.value = Math.min(1, rms * 6);
        if (!microphoneMuted.value && track.enabled && rms >= voxThreshold.value) deps.markSpeaking(state.tsClientId);
        else if (state.tsClientId) deps.clearSpeaking(state.tsClientId);
      }, 50);
    } catch {
      stopWebRtcMicMonitor(false);
    }
  }

  function stopWebRtcMicMonitor(resetLevel = true): void {
    if (webrtcMicMonitorTimer) clearInterval(webrtcMicMonitorTimer);
    webrtcMicMonitorTimer = null;
    webrtcMicMonitorSource?.disconnect();
    webrtcMicMonitorAnalyser?.disconnect();
    webrtcMicMonitorGain?.disconnect();
    webrtcMicMonitorSource = null;
    webrtcMicMonitorAnalyser = null;
    webrtcMicMonitorGain = null;
    if (resetLevel) micLevel.value = 0;
  }

  function isSessionDescription(value: unknown, type: "answer"): value is RTCSessionDescriptionInit {
    return Boolean(value) && typeof value === "object"
      && (value as { type?: unknown }).type === type
      && typeof (value as { sdp?: unknown }).sdp === "string";
  }

  function syncWebRtcMemberVolumes(): void {
    if (!webrtcActive.value || ws.value?.readyState !== WebSocket.OPEN) return;
    for (const [rawClientId, volume] of Object.entries(volumes)) {
      const clientId = Number(rawClientId);
      if (!Number.isInteger(clientId) || clientId <= 0) continue;
      deps.sendCmd("setMemberVolume", { clientId, volume });
    }
  }


  /** The live peer, if any (accompaniment and member volume ask whether WebRTC is in play). */
  function getWebRtcPeer(): RTCPeerConnection | null {
    return webrtcPeer;
  }

  /** The gain node of the microphone inside the mix stream, if a mix exists. */
  function getWebRtcMixMicGain(): GainNode | null {
    return webrtcMixMicGain;
  }

  const accompaniment = useWebRtcAccompaniment({
    getMicStream: () => deps.getMicStream(),
    sendCmd: (type, payload) => deps.sendCmd(type, payload),
    webrtcActive,
    hasPeer: () => webrtcPeer !== null,
    replaceWebRtcAudioTrack,
    stopWebRtcMix,
  });
  const { startAccompaniment, stopAccompaniment, releaseAccompanimentStream } = accompaniment;

  const handlers: MessageHandlers = {
    webrtcAnswer: (msg) => {
      void applyWebRtcAnswer(msg.payload?.sdp);
    },
    webrtcError: (msg) => {
      if (ws.value) void fallbackFromWebRtc(deps.connectionSequence(), ws.value, safeClientErrorCode(msg.code) || "WEBRTC_NEGOTIATION_FAILED");
    },
  };

  return {
    handlers,
    startWebRtcTransport, applyWebRtcAnswer, fallbackFromWebRtc, stopWebRtcTransport, stopWebRtcMix,
    replaceWebRtcAudioTrack, syncWebRtcMemberVolumes, startAccompaniment, stopAccompaniment, releaseAccompanimentStream,
    getWebRtcPeer, getWebRtcMixMicGain,
  };
}
