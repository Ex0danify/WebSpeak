import type { Ref } from "vue";
import { useVoiceAudioStore } from "@/features/voice/stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import { MAX_REMOTE_DECODE_QUEUE_FRAMES, MAX_REMOTE_PLAY_AHEAD_SECONDS, SPEAKING_HOLD_MS } from "@/features/voice/audioConstants";
import type { SinkAudioContext } from "@/features/voice/voiceTypes";
import type { MessageHandlers } from "@/features/session";

/** Late-bound pieces owned by other modules. */
export interface PlaybackDeps {
  getAudioCtx(): SinkAudioContext;
  effectiveOutputVolume(): number;
  /** While WebRTC carries the downlink, WebSocket audio frames are ignored. */
  webrtcActive: Ref<boolean>;
}

/** Downlink playback, the hot path. One decoder, gain node and schedule per remote client, plus the speaking indicator. Maps,
 *  decoders and nodes are non-reactive closure state, only `speakingIds` is reactive and it lives in the session store. */
export function usePlayback(deps: PlaybackDeps) {
  const { getAudioCtx, effectiveOutputVolume, webrtcActive } = deps;
  const { state, members, speakingIds } = useSessionStore();
  const audio = useVoiceAudioStore();

  // Playback is kept per client so frames from multiple speakers cannot
  // interleave into one decoder or one scheduling queue.
  const remoteDecoders = new Map<number, AudioDecoder>();
  const remoteDecoderGenerations = new Map<number, number>();
  let nextRemoteDecoderGeneration = 0;
  const remotePlayTimes = new Map<number, number>();
  const remotePlaybackSources = new Map<number, Set<AudioBufferSourceNode>>();
  const remoteGains = new Map<number, GainNode>();
  const remoteDecodeTimestamps = new Map<number, number>();
  const speakingTimers = new Map<number, ReturnType<typeof setTimeout>>();

  function markSpeaking(clientId: number): void {
    if (!clientId) return;
    speakingIds.add(clientId);
    const previous = speakingTimers.get(clientId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      speakingIds.delete(clientId);
      speakingTimers.delete(clientId);
    }, SPEAKING_HOLD_MS);
    speakingTimers.set(clientId, timer);
  }

  function clearSpeaking(clientId: number): void {
    const timer = speakingTimers.get(clientId);
    if (timer) clearTimeout(timer);
    speakingTimers.delete(clientId);
    speakingIds.delete(clientId);
  }

  function clearSpeakingState(): void {
    for (const timer of speakingTimers.values()) clearTimeout(timer);
    speakingTimers.clear();
    speakingIds.clear();
  }

  function playAudioFrame(clientId: number, opusData: Uint8Array): void {
    if (opusData.length < 3) return;
    let decoder = remoteDecoders.get(clientId);
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const scheduledUntil = remotePlayTimes.get(clientId) ?? now;
    const decodeQueueSize = decoder?.decodeQueueSize ?? 0;
    if (decoder && (scheduledUntil > now + MAX_REMOTE_PLAY_AHEAD_SECONDS || decodeQueueSize >= MAX_REMOTE_DECODE_QUEUE_FRAMES)) {
      resetRemotePlayback(clientId);
      decoder = undefined;
    }

    if (!decoder) {
      // A rebuilt decoder keeps the speaker's gain node: replacing it would leave the old one
      // connected, and it would stay at whatever level it last had.
      let gainNode = remoteGains.get(clientId);
      if (!gainNode) {
        gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        remoteGains.set(clientId, gainNode);
      }
      gainNode.gain.value = audio.memberGain(clientId) * effectiveOutputVolume();
      const speakerGain = gainNode;
      const generation = ++nextRemoteDecoderGeneration;
      const nextDecoder = new AudioDecoder({
        output: (chunk: AudioData) => {
          if (remoteDecoderGenerations.get(clientId) !== generation) {
            chunk.close();
            return;
          }
          try {
            const { sampleRate, numberOfChannels, numberOfFrames } = chunk;
            const buffer = ctx.createBuffer(numberOfChannels, numberOfFrames, sampleRate);
            for (let ch = 0; ch < numberOfChannels; ch++) {
              const data = new Float32Array(numberOfFrames);
              chunk.copyTo(data, { planeIndex: ch, format: "f32-planar" });
              buffer.copyToChannel(data, ch);
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(speakerGain);
            let sources = remotePlaybackSources.get(clientId);
            if (!sources) {
              sources = new Set<AudioBufferSourceNode>();
              remotePlaybackSources.set(clientId, sources);
            }
            sources.add(source);
            source.addEventListener(
              "ended",
              () => {
                source.disconnect();
                sources?.delete(source);
                if (sources?.size === 0) remotePlaybackSources.delete(clientId);
              },
              { once: true },
            );
            let playTime = remotePlayTimes.get(clientId) ?? ctx.currentTime;
            if (playTime < ctx.currentTime) playTime = ctx.currentTime;
            if (playTime + numberOfFrames / sampleRate > ctx.currentTime + MAX_REMOTE_PLAY_AHEAD_SECONDS) {
              source.disconnect();
              sources.delete(source);
              if (sources.size === 0) remotePlaybackSources.delete(clientId);
              chunk.close();
              resetRemotePlayback(clientId);
              return;
            }
            source.start(playTime);
            remotePlayTimes.set(clientId, playTime + numberOfFrames / sampleRate);
          } catch {
            // A decoder can finish while the audio context is being torn down.
          }
          chunk.close();
        },
        error: () => {
          if (remoteDecoderGenerations.get(clientId) === generation) {
            remoteDecoderGenerations.delete(clientId);
            remoteDecoders.delete(clientId);
          }
        },
      });
      nextDecoder.configure({ codec: "opus", sampleRate: 48000, numberOfChannels: 1 });
      decoder = nextDecoder;
      remoteDecoderGenerations.set(clientId, generation);
      remoteDecoders.set(clientId, decoder);
    }

    try {
      const timestamp = remoteDecodeTimestamps.get(clientId) ?? 0;
      decoder.decode(new EncodedAudioChunk({ type: "key", timestamp, duration: 20_000, data: opusData }));
      remoteDecodeTimestamps.set(clientId, timestamp + 20_000);
    } catch {
      // Ignore malformed frames, the next valid frame can still be decoded.
    }
  }

  function clearRemotePlayback(clientId: number): void {
    const decoder = remoteDecoders.get(clientId);
    if (decoder) {
      try {
        decoder.close();
      } catch {
        /* already closed */
      }
    }
    remoteDecoders.delete(clientId);
    remoteDecoderGenerations.delete(clientId);
    remotePlayTimes.delete(clientId);
    remoteDecodeTimestamps.delete(clientId);
    const sources = remotePlaybackSources.get(clientId);
    if (sources) {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          /* already ended */
        }
        source.disconnect();
      }
      remotePlaybackSources.delete(clientId);
    }
  }

  function resetRemotePlayback(clientId: number): void {
    clearRemotePlayback(clientId);
  }

  function handleAudioFrame(data: Uint8Array): void {
    // WebRTC carries the downlink after negotiation. Ignore in-flight fallback WebSocket packets so a transport switch
    // cannot produce duplicate or delayed playback.
    if (webrtcActive.value) return;
    if (data.length < 4) return;
    const clientId = (data[1] << 8) | data[2];
    if (clientId === state.tsClientId) return;
    markSpeaking(clientId);
    playAudioFrame(clientId, data.slice(3));
  }

  /** The downlink half of `disconnect`, dropping every decoder, source, gain and speaking timer. */
  function resetDownlink(): void {
    for (const clientId of new Set([...remoteDecoders.keys(), ...remotePlaybackSources.keys()])) clearRemotePlayback(clientId);
    remoteDecoderGenerations.clear();
    remotePlayTimes.clear();
    remoteDecodeTimestamps.clear();
    for (const gain of remoteGains.values()) gain.disconnect();
    remoteGains.clear();
    clearSpeakingState();
  }

  const handlers: MessageHandlers = {
    memberLeave: (msg) => {
      const clientId = Number(msg.id);
      clearSpeaking(clientId);
      clearRemotePlayback(clientId);
      const index = members.findIndex((member) => member.id === clientId);
      if (index >= 0) members.splice(index, 1);
    },
    voiceActivity: (msg) => {
      if (Array.isArray(msg.clientIds)) {
        for (const clientId of msg.clientIds) {
          if (typeof clientId === "number" && Number.isInteger(clientId) && clientId > 0) markSpeaking(clientId);
        }
      }
    },
  };

  return {
    handlers,
    remoteGains,
    markSpeaking,
    clearSpeaking,
    clearSpeakingState,
    clearRemotePlayback,
    handleAudioFrame,
    resetDownlink,
  };
}
