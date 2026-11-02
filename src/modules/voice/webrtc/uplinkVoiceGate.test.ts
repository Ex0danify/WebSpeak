import { describe, expect, it } from "vitest";
import type { OpusCodec } from "../voiceOpus.js";
import { UplinkVoiceGate } from "./uplinkVoiceGate.js";

// The first byte of a fake packet is the constant sample value it decodes to.
const decoder: OpusCodec = {
  encode: () => Buffer.alloc(0),
  decode: (packet) => {
    if (packet[0] === 255) throw new Error("broken");
    const pcm = Buffer.alloc(1920);
    for (let index = 0; index < 960; index++) pcm.writeInt16LE(packet[0]! * 100, index * 2);
    return pcm;
  },
  reset() {},
  dispose() {},
};

const quiet = Buffer.from([0]);
const loud = Buffer.from([20]);

function gate() {
  let errors = 0;
  return { gate: new UplinkVoiceGate(decoder, () => errors++), errors: () => errors };
}

describe("the uplink voice gate", () => {
  it("forwards nothing while the speaker is silent", () => {
    const { gate: g } = gate();
    for (let at = 0; at < 1000; at += 20) expect(g.push(quiet, at)).toEqual([]);
    expect(g.expired(1000)).toBe(false);
  });

  it("starts a burst with the quiet frames just before the first loud one", () => {
    const { gate: g } = gate();
    const [a, b, c] = [Buffer.from([0, 1]), Buffer.from([0, 2]), Buffer.from([0, 3])];
    g.push(a, 0);
    g.push(b, 20);
    g.push(c, 40);
    expect(g.push(loud, 60)).toEqual([b, c, loud]);
  });

  it("keeps forwarding through short pauses, then stops after the hangover", () => {
    const { gate: g } = gate();
    g.push(loud, 0);
    expect(g.push(quiet, 200)).toEqual([quiet]);
    expect(g.push(quiet, 300)).toEqual([quiet]);
    expect(g.push(quiet, 320)).toEqual([]);
  });

  it("reports the end once, also when the browser stopped sending", () => {
    const { gate: g } = gate();
    g.push(loud, 0);
    expect(g.expired(300)).toBe(false);
    expect(g.expired(400)).toBe(true);
    expect(g.expired(500)).toBe(false);
  });

  it("starts a fresh burst after an end", () => {
    const { gate: g } = gate();
    g.push(loud, 0);
    g.expired(400);
    expect(g.push(loud, 1000)).toEqual([loud]);
  });

  it("stop ends a running burst and does nothing otherwise", () => {
    const { gate: g } = gate();
    expect(g.stop()).toBe(false);
    g.push(loud, 0);
    expect(g.stop()).toBe(true);
    expect(g.stop()).toBe(false);
  });

  it("counts a packet it cannot decode and drops it", () => {
    const { gate: g, errors } = gate();
    expect(g.push(Buffer.from([255]), 0)).toEqual([]);
    expect(errors()).toBe(1);
  });
});
