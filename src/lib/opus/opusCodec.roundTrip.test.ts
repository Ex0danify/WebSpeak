import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createOpusCodec } from "./opusCodec.js";

const RATE = 48000;
const FRAME = 960; // 20 ms mono

function sineFrame(startSample: number, amplitude = 0.3): Buffer {
  const pcm = Buffer.allocUnsafe(FRAME * 2);
  for (let i = 0; i < FRAME; i++) {
    const s = Math.sin((2 * Math.PI * 440 * (startSample + i)) / RATE) * amplitude;
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  return pcm;
}

function toSamples(buf: Buffer): Float64Array {
  const out = new Float64Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

// SNR of the decoded tone against the input, searching the lag that best aligns the two (Opus adds delay).
function bestLagSnrDb(input: Float64Array, output: Float64Array): number {
  let best = -Infinity;
  for (let lag = 0; lag <= 700; lag++) {
    let signal = 0;
    let noise = 0;
    for (let i = 0; i + lag < output.length && i < input.length; i++) {
      signal += input[i] * input[i];
      const d = input[i] - output[i + lag];
      noise += d * d;
    }
    if (noise > 0) best = Math.max(best, 10 * Math.log10(signal / noise));
  }
  return best;
}

describe("opusCodec round trip", () => {
  it("encodes a 20 ms frame to a small Opus packet", () => {
    const codec = createOpusCodec(RATE, 1);
    try {
      const packet = codec.encode(sineFrame(0));
      expect(packet.length).toBeGreaterThan(0);
      expect(packet.length).toBeLessThan(1000);
    } finally {
      codec.dispose();
    }
  });

  it("recovers a sine tone above an SNR threshold", () => {
    const codec = createOpusCodec(RATE, 1);
    try {
      const decoded: Buffer[] = [];
      // Steady state only: the encoder needs a few frames to settle.
      for (let f = 0; f < 30; f++) {
        const pcm = sineFrame(f * FRAME);
        const out = codec.decode(codec.encode(pcm));
        if (f >= 20) decoded.push(out);
      }
      const input = toSamples(Buffer.concat([sineFrame(20 * FRAME), sineFrame(21 * FRAME)]));
      const snr = bestLagSnrDb(input, toSamples(Buffer.concat(decoded)));
      expect(snr).toBeGreaterThan(15);
    } finally {
      codec.dispose();
    }
  });

  it("decodes near silence from a silent frame", () => {
    const codec = createOpusCodec(RATE, 1);
    try {
      const silence = Buffer.alloc(FRAME * 2);
      let peak = 0;
      for (let f = 0; f < 10; f++) {
        const out = toSamples(codec.decode(codec.encode(silence)));
        for (const s of out) peak = Math.max(peak, Math.abs(s));
      }
      expect(peak).toBeLessThan(64); // well under int16 full scale
    } finally {
      codec.dispose();
    }
  });

  it("interoperates with @discordjs/opus in both directions", () => {
    const require = createRequire(import.meta.url);
    const { OpusEncoder } = require("@discordjs/opus") as {
      OpusEncoder: new (rate: number, ch: number) => { encode(b: Buffer): Buffer; decode(b: Buffer): Buffer };
    };
    const native = new OpusEncoder(RATE, 1);
    const codec = createOpusCodec(RATE, 1);
    try {
      const pcm = sineFrame(0);
      expect(native.decode(codec.encode(pcm)).length).toBe(FRAME * 2);
      expect(codec.decode(native.encode(pcm)).length).toBe(FRAME * 2);
    } finally {
      codec.dispose();
    }
  });
});
