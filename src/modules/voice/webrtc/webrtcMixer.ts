import type { Logger as LoggerType } from "../../../shared/logger.js";
import type { TSVoiceData } from "../../teamspeak/index.js";
import { createOpusCodec, type OpusCodec } from "../voiceOpus.js";

export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_FRAME_SAMPLES = 960;
export const AUDIO_CLOCK_INTERVAL_MS = 20;
const AUDIO_FRAME_BYTES = AUDIO_FRAME_SAMPLES * 2;
const MAX_MIXER_QUEUE_FRAMES = 4;
export const MAX_MIXER_PACER_LAG_MS = AUDIO_CLOCK_INTERVAL_MS * 2;
const MAX_MIXER_FRAME_AGE_MS = MAX_MIXER_QUEUE_FRAMES * AUDIO_CLOCK_INTERVAL_MS;
const MIXER_UNDERRUN_WINDOW_MS = 200;
// Only drives the speaking indicator and must never gate forwarding. Quiet and comfort-noise
// Opus packets are valid media, dropping them breaks decoder continuity.
const SPEAKER_ACTIVITY_RMS = 160;

/** Counters the mixer updates, owned and exposed by the session. */
export interface WebRtcMixerStats {
  webrtcQueuePeakFrames: number;
  webrtcQueueDroppedFrames: number;
  webrtcQueueUnderrunTicks: number;
  webrtcDownlinkDecodedFrames: number;
  webrtcDownlinkDecodeErrors: number;
  webrtcDownlinkShortFrames: number;
}

interface PendingAudioFrame {
  pcm: Buffer;
  receivedAt: number;
}

/**
 * TeamSpeak sends one Opus payload per speaker but the WebRTC track carries one. The mixer decodes each
 * speaker into a tiny bounded queue and mixes one frame per active speaker every 20 ms tick.
 * The session owns the clock and the RTP send.
 */
export class WebRtcMixer {
  private readonly decoderByClient = new Map<number, OpusCodec>();
  private readonly partialPcmByClient = new Map<number, Buffer>();
  private readonly pendingFrames = new Map<number, PendingAudioFrame[]>();
  private readonly memberVolumes = new Map<number, number>();
  private readonly activeSpeakerIds = new Set<number>();
  private lastQueueEnqueuedAt: number | null = null;
  private encoder: OpusCodec | null;

  constructor(
    encoder: OpusCodec,
    private readonly stats: WebRtcMixerStats,
    private readonly logger: LoggerType,
  ) {
    this.encoder = encoder;
  }

  pushTeamSpeakVoice(data: TSVoiceData): void {
    let decoder = this.decoderByClient.get(data.clientId);
    if (!decoder) {
      try {
        decoder = createOpusCodec(AUDIO_SAMPLE_RATE, 1);
        this.decoderByClient.set(data.clientId, decoder);
      } catch (error: unknown) {
        this.logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Could not create WebRTC mixer decoder");
        return;
      }
    }
    try {
      const pcm = decoder.decode(data.data);
      this.stats.webrtcDownlinkDecodedFrames++;
      if (pcm.length < 2) {
        this.stats.webrtcDownlinkShortFrames++;
        return;
      }
      // TS may send 10/20/40/60 ms frames. Keep the partial frame per speaker and split into
      // 20 ms pieces instead of dropping everything after the first.
      const pendingPcm = this.partialPcmByClient.get(data.clientId);
      const combined = pendingPcm ? Buffer.concat([pendingPcm, pcm]) : pcm;
      const rms = calculateRms(pcm);
      // RMS only feeds the speaking indicator, every frame (even comfort noise) still goes into the
      // queue so the receiver keeps an unbroken codec timeline.
      if (rms >= SPEAKER_ACTIVITY_RMS) this.activeSpeakerIds.add(data.clientId);
      let offset = 0;
      let enqueued = false;
      let queue = this.pendingFrames.get(data.clientId);
      while (offset + AUDIO_FRAME_BYTES <= combined.length) {
        if (!queue) {
          queue = [];
          this.pendingFrames.set(data.clientId, queue);
        }
        if (queue.length >= MAX_MIXER_QUEUE_FRAMES) {
          queue.shift();
          this.stats.webrtcQueueDroppedFrames++;
        }
        queue.push({
          pcm: Buffer.from(combined.subarray(offset, offset + AUDIO_FRAME_BYTES)),
          receivedAt: performance.now(),
        });
        enqueued = true;
        offset += AUDIO_FRAME_BYTES;
      }
      if (offset < combined.length) this.partialPcmByClient.set(data.clientId, Buffer.from(combined.subarray(offset)));
      else this.partialPcmByClient.delete(data.clientId);
      if (enqueued) {
        this.lastQueueEnqueuedAt = performance.now();
        this.stats.webrtcQueuePeakFrames = Math.max(this.stats.webrtcQueuePeakFrames, this.getQueueFrameCount());
      }
    } catch {
      this.stats.webrtcDownlinkDecodeErrors++;
      // Malformed or codec-transition packets are dropped, the next valid frame recovers the stream.
    }
  }

  /** Takes one frame from every speaker queue and returns the Opus packet to send, or null. */
  mixNextFrame(): Buffer | null {
    if (!this.encoder) return null;
    if (!this.pendingFrames.size) {
      if (this.lastQueueEnqueuedAt !== null && performance.now() - this.lastQueueEnqueuedAt <= MIXER_UNDERRUN_WINDOW_MS) {
        this.stats.webrtcQueueUnderrunTicks++;
      }
    }
    const mixed = new Int32Array(AUDIO_FRAME_SAMPLES);
    for (const [clientId, queue] of this.pendingFrames) {
      const frame = queue.shift();
      if (queue.length === 0) this.pendingFrames.delete(clientId);
      if (!frame) continue;
      const volume = this.memberVolumes.get(clientId) ?? 1;
      for (let index = 0; index < AUDIO_FRAME_SAMPLES; index++) {
        mixed[index] += Math.round(frame.pcm.readInt16LE(index * 2) * volume);
      }
    }

    // Every packet is encoded here, even for a lone speaker at unit volume. The track is one RTP stream, and mixing
    // TeamSpeak's own Opus packets into it between our encoded ones breaks the listener's decoder state.
    const pcm = Buffer.allocUnsafe(AUDIO_FRAME_BYTES);
    for (let index = 0; index < AUDIO_FRAME_SAMPLES; index++) {
      // Fixed gain on the mix. Soft limiting changes the apparent loudness with the source level,
      // bad for music. Only clip real overflow and never normalize by speaker count.
      const sample = Math.max(-32_768, Math.min(32_767, mixed[index]!));
      pcm.writeInt16LE(sample, index * 2);
    }
    try {
      return this.encoder.encode(pcm);
    } catch {
      // A peer closing at the same time may reject a packet, teardown owns the lifecycle so nothing is logged per frame.
      return null;
    }
  }

  trimQueuesAfterLateTick(): void {
    const now = performance.now();
    for (const [clientId, queue] of this.pendingFrames) {
      while (queue.length > 1) {
        queue.shift();
        this.stats.webrtcQueueDroppedFrames++;
      }
      if (queue[0] && now - queue[0].receivedAt > MAX_MIXER_FRAME_AGE_MS) {
        queue.shift();
        this.stats.webrtcQueueDroppedFrames++;
      }
      if (queue.length === 0) this.pendingFrames.delete(clientId);
    }
  }

  getQueueFrameCount(): number {
    let count = 0;
    for (const queue of this.pendingFrames.values()) count += queue.length;
    return count;
  }

  /** Speakers above the activity threshold since the last call. */
  takeActiveSpeakers(): number[] {
    if (!this.activeSpeakerIds.size) return [];
    const ids = [...this.activeSpeakerIds];
    this.activeSpeakerIds.clear();
    return ids;
  }

  setMemberVolume(clientId: number, volume: number): void {
    if (!Number.isInteger(clientId) || clientId <= 0 || clientId > 65535 || !Number.isFinite(volume)) return;
    const normalized = Math.max(0, Math.min(4, volume));
    if (normalized === 1) this.memberVolumes.delete(clientId);
    else this.memberVolumes.set(clientId, normalized);
  }

  close(): void {
    this.pendingFrames.clear();
    this.memberVolumes.clear();
    this.partialPcmByClient.clear();
    this.activeSpeakerIds.clear();
    for (const decoder of this.decoderByClient.values()) decoder.dispose();
    this.decoderByClient.clear();
    this.encoder?.dispose();
    this.encoder = null;
  }
}

function calculateRms(pcm: Buffer): number {
  let sum = 0;
  let samples = 0;
  for (let index = 0; index + 1 < pcm.length; index += 2) {
    const sample = pcm.readInt16LE(index);
    sum += sample * sample;
    samples++;
  }
  return samples ? Math.sqrt(sum / samples) : 0;
}
