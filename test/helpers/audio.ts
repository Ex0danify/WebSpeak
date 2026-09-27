import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { OpusEncoder } = require("@discordjs/opus") as {
  OpusEncoder: new (sampleRate: number, channels: number) => { encode(pcm: Buffer): Buffer; decode(opus: Buffer): Buffer };
};

export const SAMPLE_RATE = 48_000;
/** One browser audio frame: 20 ms of mono 48 kHz Int16 PCM. */
export const FRAME_SAMPLES = 960;
export const FRAME_BYTES = FRAME_SAMPLES * 2;

/** `frames` consecutive 20 ms frames of a sine wave, generated, never recorded. Frame `n` continues where `n - 1` ended. */
export function sineFrames(frequencyHz: number, frames: number, amplitude = 8000): Buffer[] {
  return Array.from({ length: frames }, (_, frame) => {
    const pcm = Buffer.alloc(FRAME_BYTES);
    for (let i = 0; i < FRAME_SAMPLES; i++) {
      const t = (frame * FRAME_SAMPLES + i) / SAMPLE_RATE;
      pcm.writeInt16LE(Math.round(amplitude * Math.sin(2 * Math.PI * frequencyHz * t)), i * 2);
    }
    return pcm;
  });
}

export const silentFrame = (): Buffer => Buffer.alloc(FRAME_BYTES);

/** Decodes Opus packets in order with one decoder, like a receiving client, into one Int16 sample array. */
export function decodeOpus(packets: Buffer[]): Int16Array {
  const decoder = new OpusEncoder(SAMPLE_RATE, 1);
  const chunks = packets.map((packet) => decoder.decode(packet));
  const pcm = Buffer.concat(chunks);
  return new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
}

/** Signal power at one frequency (Goertzel), normalised by the sample count so it is comparable across lengths. */
export function powerAt(samples: Int16Array, frequencyHz: number): number {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequencyHz) / SAMPLE_RATE);
  let previous = 0;
  let beforePrevious = 0;
  for (const sample of samples) {
    const current = sample + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return (previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious) / (samples.length * samples.length);
}

export const rms = (samples: Int16Array): number => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
