import type { Ref } from "vue";
import { storeToRefs } from "pinia";
import { useVoiceAudioStore } from "../stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import { safeClientErrorCode } from "@/features/session";
import type { LocalizedText, TextParams } from "@/shared/i18n/localizedText";
import type { SinkAudioContext, SinkAudioElement } from "../voiceTypes";
import type { MessageHandlers } from "@/features/session";
import { useWebRtcAccompaniment } from "./useWebRtcAccompaniment";

/** Late-bound pieces owned by other modules, resolved at call time. */
export interface WebRtcTransportDeps {
  getMicStream(): MediaStream | null;
  getProcessedMicStream(): MediaStream | null;
  ensureMicrophone(): Promise<void>;
  startMicrophone(): Promise<void>;
  stopCaptureGraph(): void;
  setMicrophoneError(error: unknown): LocalizedText;
  getAudioCtx(): SinkAudioContext;
  effectiveOutputVolume(): number;
  stopWebRtcPlayback(): void;
  attachWebRtcPlayback(output: SinkAudioElement, stream: MediaStream): void;
  syncWebRtcPlayback(): Promise<void>;
  setAudioNotice(code: string, params?: TextParams): void;
  markSpeaking(clientId: number): void;
  clearSpeaking(clientId: number): void;
  sendCmd(type: string, payload?: Record<string, unknown>): void;
  sendCommand(type: string, payload: Record<string, unknown>): Promise<void>;
  connectionSequence(): number;
  hasLastConnection(): boolean;
  /** The transport's flag, PCM is not sent over the WebSocket while WebRTC carries the microphone. */
  webrtcActive: Ref<boolean>;
  /** The microphone level. The assembler owns the ref (it is public) and the capture chunk writes it too. */
  micLevel: Ref<number>;
}

/** The WebRTC voice transport, covering the peer, the mic mix stream, the mic monitor, the answer, the PCM WebSocket fallback
 *  and the accompaniment that joins the mix. Peer, mix nodes and monitor are non-reactive closure state, never in Pinia. */
export function useWebRtcTransport(deps: WebRtcTransportDeps) {
  const session = useSessionStore();
  const { ws } = storeToRefs(session);
  const { state } = session;
  const audio = useVoiceAudioStore();
  const { microphoneMuted, inputVolume, voxThreshold, selectedOutputDeviceId, accompanimentActive } = storeToRefs(audio);
  const { volumes, mutedMembers } = audio;
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
    if (!micStream) throw new Error("No microphone track is available");
    const ctx = deps.getAudioCtx();
    stopWebRtcMix();
    const destination = ctx.createMediaStreamDestination();
    destination.channelCount = 1;
    destination.channelCountMode = "explicit";
    // Browser-native processed track plus the browser-side RNNoise graph. Display/application audio is added below and
    // never goes through this denoiser.
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
      // Keep the captured application audio at its source level. No fixed gain node, it makes music quieter than the source
      // and invites later 'compensation' steps that pump its volume.
      accompanimentSource.connect(destination);
      webrtcMixAccompanimentSource = accompanimentSource;
    }
    return destination.stream;
  }

  async function replaceWebRtcAudioTrack(): Promise<void> {
    if (!webrtcPeer || !deps.getMicStream()) return;
    const sender = webrtcPeer.getSenders().find((candidate) => candidate.track?.kind === "audio");
    if (!sender) throw new Error("The WebRTC audio track is not ready");
    const mixedStream = createWebRtcMixStream();
    const mixedTrack = mixedStream.getAudioTracks()[0];
    if (!mixedTrack) throw new Error("The mixed audio track could not be created");
    await sender.replaceTrack(mixedTrack);
  }

  async function startWebRtcTransport(sequence: number, socket: WebSocket): Promise<void> {
    if (typeof RTCPeerConnection === "undefined") throw new Error("This browser does not support WebRTC");
    await deps.ensureMicrophone();
    const micStream = deps.getMicStream();
    if (sequence !== deps.connectionSequence() || socket.readyState !== WebSocket.OPEN || !micStream) return;
    const microphoneTrack = micStream.getAudioTracks()[0];
    if (!microphoneTrack) throw new Error("No microphone track is available");

    deps.stopCaptureGraph();
    const peer = new RTCPeerConnection({ iceServers: [] });
    webrtcPeer = peer;
    webrtcFallbackStarted = false;
    microphoneTrack.enabled = !microphoneMuted.value;
    const mixedStream = createWebRtcMixStream();
    const mixedTrack = mixedStream.getAudioTracks()[0];
    if (!mixedTrack) throw new Error("The mixed audio track could not be created");
    peer.addTrack(mixedTrack, mixedStream);
    peer.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      // Native WebRTC output, not an AudioContext. A suspended context silently ate the audio while the control channel
      // still reported speaking, and a hidden autoplaying media element keeps the decoder and jitter buffer native.
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
      socket.send(
        JSON.stringify({
          type: "webrtcOffer",
          payload: {
            sdp: { type: description.type, sdp: description.sdp },
            muted: microphoneMuted.value,
            accompanimentActive: accompanimentActive.value,
          },
        }),
      );
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
      // Falling back to the compatibility transport must be visible, the user stays connected but with different latency and
      // quality.
      deps.setAudioNotice("WEBRTC_FALLBACK", { code: safeClientErrorCode(reasonCode) || "WEBRTC_UNAVAILABLE" });
      try {
        await deps.startMicrophone();
      } catch (error: unknown) {
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
    return (
      Boolean(value) &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === type &&
      typeof (value as { sdp?: unknown }).sdp === "string"
    );
  }

  function syncWebRtcMemberVolumes(): void {
    if (!webrtcActive.value || ws.value?.readyState !== WebSocket.OPEN) return;
    for (const rawClientId of new Set([...Object.keys(volumes), ...Object.keys(mutedMembers)])) {
      const clientId = Number(rawClientId);
      if (!Number.isInteger(clientId) || clientId <= 0) continue;
      deps.sendCmd("setMemberVolume", { clientId, volume: audio.memberGain(clientId) });
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
    sendCommand: (type, payload) => deps.sendCommand(type, payload),
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
      if (ws.value)
        void fallbackFromWebRtc(deps.connectionSequence(), ws.value, safeClientErrorCode(msg.code) || "WEBRTC_NEGOTIATION_FAILED");
    },
  };

  return {
    handlers,
    startWebRtcTransport,
    applyWebRtcAnswer,
    fallbackFromWebRtc,
    stopWebRtcTransport,
    stopWebRtcMix,
    replaceWebRtcAudioTrack,
    syncWebRtcMemberVolumes,
    startAccompaniment,
    stopAccompaniment,
    releaseAccompanimentStream,
    getWebRtcPeer,
    getWebRtcMixMicGain,
  };
}
