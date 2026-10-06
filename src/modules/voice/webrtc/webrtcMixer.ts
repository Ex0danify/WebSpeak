import type { Logger as LoggerType } from "../../../shared/logger.js";
import type { TSVoiceData } from "../../teamspeak/index.js";
import { OpusEncoder } from "../voiceOpus.js";

export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_FRAME_SAMPLES = 960;
export const AUDIO_CLOCK_INTERVAL_MS = 20;
const AUDIO_FRAME_BYTES = AUDIO_FRAME_SAMPLES * 2;
const MAX_MIXER_QUEUE_FRAMES = 4;
export const MAX_MIXER_PACER_LAG_MS = AUDIO_CLOCK_INTERVAL_MS * 2;
const MAX_MIXER_FRAME_AGE_MS = MAX_MIXER_QUEUE_FRAMES * AUDIO_CLOCK_INTERVAL_MS;
const MIXER_UNDERRUN_WINDOW_MS = 200;
// This threshold is used only for the speaking indicator. It must never decide
// whether a media packet is forwarded or queued: quiet/comfort-noise Opus
// packets are still valid media and dropping them can break decoder continuity.
const SPEAKER_ACTIVITY_RMS = 160;

/** The counters the mixer updates; the session owns the object and exposes it. */
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
  /** Preserve a native 20 ms Opus frame when no mix is required. */
  opus?: Buffer;
}

interface SelectedAudioFrame extends PendingAudioFrame {
  clientId: number;
  volume: number;
}

/**
 * TeamSpeak provides one Opus payload per speaker; the WebRTC track carries one.
 * The mixer decodes each speaker into a very small bounded queue and, once per
 * 20 ms tick, mixes one frame from each active speaker back into one Opus packet.
 * The session owns the pacing clock and the RTP send.
 */
export class WebRtcMixer {
  private readonly decoderByClient = new Map<number, { decode(data: Buffer): Buffer }>();
  private readonly partialPcmByClient = new Map<number, Buffer>();
  private readonly pendingFrames = new Map<number, PendingAudioFrame[]>();
  private readonly memberVolumes = new Map<number, number>();
  private readonly activeSpeakerIds = new Set<number>();
  private lastQueueEnqueuedAt: number | null = null;
  private encoder: { encode(data: Buffer): Buffer } | null;

  constructor(
    encoder: { encode(data: Buffer): Buffer },
    private readonly stats: WebRtcMixerStats,
    private readonly logger: LoggerType,
  ) {
    this.encoder = encoder;
  }

  pushTeamSpeakVoice(data: TSVoiceData): void {
    let decoder = this.decoderByClient.get(data.clientId);
    if (!decoder) {
      try {
        // @discordjs/opus exposes decoding on OpusEncoder instances too;
        // there is no separate OpusDecoder constructor in that package.
        decoder = new OpusEncoder(AUDIO_SAMPLE_RATE, 1);
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
      // TeamSpeak may deliver 10/20/40/60 ms Opus frames. Keep a partial
      // decoded frame per speaker and split every decoded buffer into the
      // fixed 20 ms cadence used by the WebRTC mixer instead of discarding
      // anything after the first 20 ms.
      const pendingPcm = this.partialPcmByClient.get(data.clientId);
      const combined = pendingPcm ? Buffer.concat([pendingPcm, pcm]) : pcm;
      const rms = calculateRms(pcm);
      // RMS is used only for the UI speaking indicator. Every decoded frame,
      // including quiet/comfort-noise frames, continues into the queue so the
      // receiver keeps an uninterrupted codec timeline.
      if (rms >= SPEAKER_ACTIVITY_RMS) this.activeSpeakerIds.add(data.clientId);
      const canForwardOpus = !pendingPcm && pcm.length === AUDIO_FRAME_BYTES;
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
          ...(canForwardOpus && offset === 0 ? { opus: Buffer.from(data.data) } : {}),
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
      // A malformed or codec-transition packet is discarded without touching
      // the peer connection. The next valid Opus frame can recover the stream.
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
    const selectedFrames: SelectedAudioFrame[] = [];
    for (const [clientId, queue] of this.pendingFrames) {
      const frame = queue.shift();
      if (queue.length === 0) this.pendingFrames.delete(clientId);
      if (!frame) continue;
      const volume = this.memberVolumes.get(clientId) ?? 1;
      selectedFrames.push({ ...frame, clientId, volume });
      for (let index = 0; index < AUDIO_FRAME_SAMPLES; index++) {
        mixed[index] += Math.round(frame.pcm.readInt16LE(index * 2) * volume);
      }
    }

    if (selectedFrames.length === 1 && selectedFrames[0]?.opus && selectedFrames[0].volume === 1) {
      return selectedFrames[0].opus;
    }

    const pcm = Buffer.allocUnsafe(AUDIO_FRAME_BYTES);
    for (let index = 0; index < AUDIO_FRAME_SAMPLES; index++) {
      // Keep a fixed gain for the mixed path. Per-sample soft limiting changes
      // the waveform's apparent loudness as the source level changes, which
      // is especially noticeable on music. Only clip actual overflow caused
      // by simultaneous speakers; never normalize by the active speaker count.
      const sample = Math.max(-32_768, Math.min(32_767, mixed[index]!));
      pcm.writeInt16LE(sample, index * 2);
    }
    try {
      return this.encoder.encode(pcm);
    } catch {
      // A peer closing concurrently may reject a packet; teardown owns the
      // session lifecycle and no per-frame error needs to reach the logs.
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
    this.decoderByClient.clear();
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
