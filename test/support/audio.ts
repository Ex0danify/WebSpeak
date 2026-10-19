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

// First byte of an uplink binary frame: PCM payload or an already-encoded Opus voice frame.
export const UPLINK_TAG_PCM = 0;
export const UPLINK_TAG_OPUS_VOICE = 4;

/** Wrap a raw PCM frame as the browser sends it over the WebSocket. */
export const pcmWireFrame = (pcm: Buffer): Buffer => Buffer.concat([Buffer.from([UPLINK_TAG_PCM]), pcm]);

/** Wrap an already-encoded Opus frame as a browser with WebCodecs sends it. */
export const opusWireFrame = (opus: Buffer): Buffer => Buffer.concat([Buffer.from([UPLINK_TAG_OPUS_VOICE]), opus]);

/** `frames` tagged PCM wire frames of a sine wave, ready for `socket.sendRaw`. */
export const sinePcmWireFrames = (frequencyHz: number, frames: number, amplitude = 8000): Buffer[] =>
  sineFrames(frequencyHz, frames, amplitude).map(pcmWireFrame);

/** `frames` tagged Opus wire frames of a sine wave, as a browser that encodes in place would send. */
export function sineOpusWireFrames(frequencyHz: number, frames: number, amplitude = 8000): Buffer[] {
  const encoder = new OpusEncoder(SAMPLE_RATE, 1);
  return sineFrames(frequencyHz, frames, amplitude).map((pcm) => opusWireFrame(encoder.encode(pcm)));
}

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
  return (
    (previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious) / (samples.length * samples.length)
  );
}

export const rms = (samples: Int16Array): number => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
