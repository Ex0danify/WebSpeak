import { describe, expect, it } from "vitest";
import { opusChannelsForCodec, opusPacketDurationUs } from "@/features/voice/engine/opusPacket";

/** TOC byte for a config and frame count code, stereo bit clear. */
const toc = (config: number, code: number) => (config << 3) | code;

describe("opusChannelsForCodec", () => {
  it("plays voice as mono and music as stereo", () => {
    expect(opusChannelsForCodec(4)).toBe(1);
    expect(opusChannelsForCodec(5)).toBe(2);
  });
});

describe("opusPacketDurationUs", () => {
  it("reads the frame length from the config", () => {
    expect(opusPacketDurationUs(Uint8Array.of(toc(31, 0), 1))).toBe(20_000); // CELT fullband 20 ms
    expect(opusPacketDurationUs(Uint8Array.of(toc(28, 0), 1))).toBe(2_500); // CELT fullband 2.5 ms
    expect(opusPacketDurationUs(Uint8Array.of(toc(3, 0), 1))).toBe(60_000); // SILK 60 ms
    expect(opusPacketDurationUs(Uint8Array.of(toc(13, 0), 1))).toBe(20_000); // hybrid 20 ms
  });

  it("doubles the length for two frames", () => {
    expect(opusPacketDurationUs(Uint8Array.of(toc(31, 1), 1))).toBe(40_000);
    expect(opusPacketDurationUs(Uint8Array.of(toc(31, 2), 1))).toBe(40_000);
  });

  it("counts frames from the second byte for arbitrary frame counts", () => {
    expect(opusPacketDurationUs(Uint8Array.of(toc(31, 3), 0x43))).toBe(60_000);
  });

  it("falls back to 20 ms when the packet is too short to tell", () => {
    expect(opusPacketDurationUs(new Uint8Array())).toBe(20_000);
    expect(opusPacketDurationUs(Uint8Array.of(toc(31, 3)))).toBe(20_000);
  });
});
