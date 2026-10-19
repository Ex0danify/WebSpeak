import { describe, expect, it } from "vitest";
import { compressQuickLz } from "../../../../test/support/quickLzCompressor.js";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { decompressQuickLz } from "./quickLz.js";

// Fixed pseudo-random bytes (an LCG), so a failure can be reproduced.
let state = 7;
const randomBytes = (length: number) =>
  Buffer.from(Array.from({ length }, () => (state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0) >>> 24));
const commandText = (rows: number) =>
  Buffer.from(Array.from({ length: rows }, (_, i) => `cid=${i} cpid=${i >> 2} channel_name=Room\\s${i} channel_order=${i - 1}`).join("|"));

const inputs: [string, Buffer][] = [
  ["a short command", Buffer.from("clientupdate client_input_muted=1")],
  ["fewer bytes than the literal tail", Buffer.from("abc")],
  ["a run of one byte", Buffer.alloc(3000, 0x61)],
  ["random bytes", randomBytes(2000)],
  ["a 20 kB channel list", commandText(300)],
  ["long matches over 17 bytes", Buffer.from("x".repeat(40) + "0123456789abcdefghij".repeat(30) + "tail-of-the-data")],
];

describe("decompressQuickLz", () => {
  for (const [name, input] of inputs) {
    it(`round trips ${name}`, () => {
      const compressed = compressQuickLz(input);
      expect(decompressQuickLz(compressed).equals(input)).toBe(true);
    });
  }

  it("actually finds matches in repetitive text, so the reference path is covered", () => {
    const input = commandText(300);
    expect(compressQuickLz(input).length).toBeLessThan(input.length / 2);
  });

  it("reads data stored without compression", () => {
    const stored = Buffer.concat([Buffer.from([0x44, 8, 5]), Buffer.from("hello")]);
    expect(decompressQuickLz(stored).toString()).toBe("hello");
  });

  const malformed: [string, Buffer][] = [
    ["data shorter than a short header", Buffer.from([0x45, 2])],
    ["a long header that is cut off", Buffer.from([0x47, 9, 0, 0])],
    ["level 3", Buffer.from([0x4d, 3, 0])],
    ["a compressed size that does not match", Buffer.concat([compressQuickLz(Buffer.from("hello world")), Buffer.from([0])])],
    ["stored data shorter than its size", Buffer.from([0x44, 5, 9, 1, 2])],
    ["a missing control word", Buffer.from([0x45, 4, 20, 0])],
    ["a reference before anything was hashed", Buffer.from([0x45, 9, 20, 0x01, 0, 0, 0x80, 0x13, 0x00])],
    ["a cut off reference", Buffer.from([0x45, 8, 20, 0x01, 0, 0, 0x80, 0x13])],
    ["a cut off long reference", Buffer.from([0x45, 9, 20, 0x01, 0, 0, 0x80, 0x10, 0x00])],
    ["literals that run out", Buffer.from([0x45, 9, 20, 0, 0, 0, 0x80, 0x61, 0x62])],
    ["tail literals that run out", Buffer.from([0x45, 9, 5, 0, 0, 0, 0x80, 0x61, 0x62])],
    ["bytes after the end", Buffer.from([0x45, 9, 1, 0, 0, 0, 0x80, 0x61, 0x62])],
  ];
  for (const [name, data] of malformed) {
    it(`rejects ${name}`, () => {
      expect(() => decompressQuickLz(data)).toThrow(TeamSpeakTransportError);
    });
  }

  it("rejects a reference that runs past the output", () => {
    const valid = compressQuickLz(Buffer.from("abcabcabcabcabcabcabcabcabc-0123456789"));
    // Same stream, but the header claims a shorter output, so the first reference overruns it.
    const shortened = Buffer.from(valid);
    shortened[2] = 15;
    expect(() => decompressQuickLz(shortened)).toThrow(/runs past the output/);
  });

  it("rejects an output over the limit before allocating it", () => {
    const header = Buffer.alloc(9);
    header[0] = 0x47;
    header.writeUInt32LE(9, 1);
    header.writeUInt32LE(0xffff_ffff, 5);
    expect(() => decompressQuickLz(header)).toThrow(/over the limit/);
    expect(() => decompressQuickLz(compressQuickLz(Buffer.alloc(100)), 99)).toThrow(/over the limit/);
  });
});
