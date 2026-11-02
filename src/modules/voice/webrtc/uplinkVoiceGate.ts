import type { OpusCodec } from "../voiceOpus.js";

// The browser track never goes quiet on the wire, so the level decides when a talk burst starts and ends.
const VOICE_RMS = 120;
// Keeps the tail of a word and short pauses inside one burst.
const HANGOVER_MS = 300;
// Soft onsets sit below the threshold, so the frames before the first loud one go out with it.
const PRE_ROLL_FRAMES = 2;

/** Decides which uplink Opus packets are voice. Every packet is decoded, so the decoder keeps its state across the silence. */
export class UplinkVoiceGate {
  private active = false;
  private lastVoiceAt = 0;
  private preRoll: Buffer[] = [];

  constructor(
    private readonly decoder: OpusCodec,
    private readonly onDecodeError: () => void,
  ) {}

  /** The packets to forward now, none while the speaker is silent. */
  push(packet: Buffer, now: number): Buffer[] {
    let loud = false;
    try {
      loud = rms(this.decoder.decode(packet)) >= VOICE_RMS;
    } catch {
      this.onDecodeError();
    }
    if (loud) {
      this.lastVoiceAt = now;
      const out = this.active ? [packet] : [...this.preRoll, packet];
      this.active = true;
      this.preRoll = [];
      return out;
    }
    if (this.active && now - this.lastVoiceAt <= HANGOVER_MS) return [packet];
    if (!this.active) {
      this.preRoll.push(packet);
      if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
    }
    return [];
  }

  /** True once when the hangover has run out, also when the browser stopped sending altogether. */
  expired(now: number): boolean {
    if (!this.active || now - this.lastVoiceAt <= HANGOVER_MS) return false;
    this.active = false;
    return true;
  }

  /** True when a burst was running and is now cut off, for a mute or a codec switch. */
  stop(): boolean {
    const was = this.active;
    this.active = false;
    this.preRoll = [];
    return was;
  }

  dispose(): void {
    this.decoder.dispose();
  }
}

function rms(pcm: Buffer): number {
  let sum = 0;
  const samples = pcm.length >> 1;
  for (let index = 0; index < samples; index++) {
    const sample = pcm.readInt16LE(index * 2);
    sum += sample * sample;
  }
  return samples ? Math.sqrt(sum / samples) : 0;
}
