import { describe, expect, it } from "vitest";
import { createOpusCodec } from "./opusCodec.js";

const RATE = 48000;
const FRAME = 960;

function tone(): Buffer {
  const pcm = Buffer.allocUnsafe(FRAME * 2);
  for (let i = 0; i < FRAME; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / RATE) * 0.3 * 32767), i * 2);
  return pcm;
}

describe("opusCodec resilience", () => {
  it("returns no audio for empty or garbage input without throwing", () => {
    const codec = createOpusCodec(RATE, 1);
    try {
      expect(codec.decode(Buffer.alloc(0)).length).toBe(0);
      expect(() => codec.decode(Buffer.from([0xff, 0x13, 0x37, 0x00, 0x42]))).not.toThrow();
      expect(codec.decode(Buffer.alloc(5000, 0xaa)).length).toBe(0); // oversized
    } finally {
      codec.dispose();
    }
  });

  it("keeps encoding after reset", () => {
    const codec = createOpusCodec(RATE, 1);
    try {
      expect(codec.encode(tone()).length).toBeGreaterThan(0);
      codec.reset();
      expect(codec.encode(tone()).length).toBeGreaterThan(0);
    } finally {
      codec.dispose();
    }
  });

  it("is idempotent on dispose", () => {
    const codec = createOpusCodec(RATE, 1);
    codec.dispose();
    expect(() => codec.dispose()).not.toThrow();
  });

  it("does not leak heap across many create/dispose cycles", async () => {
    const pcm = tone();
    // Warm up so one-time allocations settle before the baseline.
    for (let i = 0; i < 50; i++) {
      const c = createOpusCodec(RATE, 1);
      c.decode(c.encode(pcm));
      c.dispose();
    }
    const { opusModule } = await import("./opusModule.js");
    const before = opusModule().HEAPU8.length;
    for (let i = 0; i < 2000; i++) {
      const c = createOpusCodec(RATE, 1);
      c.decode(c.encode(pcm));
      c.dispose();
    }
    expect(opusModule().HEAPU8.length).toBe(before);
  });

  it("supports a stereo (music) codec", () => {
    const codec = createOpusCodec(RATE, 2);
    try {
      const pcm = Buffer.alloc(FRAME * 2 * 2); // 960 stereo frames, interleaved int16
      for (let i = 0; i < FRAME * 2; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / RATE) * 0.3 * 32767), i * 2);
      const out = codec.decode(codec.encode(pcm));
      expect(out.length).toBe(FRAME * 2 * 2);
    } finally {
      codec.dispose();
    }
  });
});
