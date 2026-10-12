import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { decodeOpus, sineFrames } from "../../../../test/support/audio.js";
import { WebRtcMixer, type WebRtcMixerStats } from "./webrtcMixer.js";

const require = createRequire(import.meta.url);
const { OpusEncoder } = require("@discordjs/opus") as {
  OpusEncoder: new (sampleRate: number, channels: number) => { encode(pcm: Buffer): Buffer; decode(data: Buffer): Buffer };
};
const OpusDecoder = OpusEncoder;

const logger = { warn: () => undefined } as never;
const newStats = (): WebRtcMixerStats => ({
  webrtcQueuePeakFrames: 0,
  webrtcQueueDroppedFrames: 0,
  webrtcQueueUnderrunTicks: 0,
  webrtcDownlinkDecodedFrames: 0,
  webrtcDownlinkDecodeErrors: 0,
  webrtcDownlinkShortFrames: 0,
});
const newMixer = (stats = newStats()) => ({ stats, mixer: new WebRtcMixer(new OpusEncoder(48_000, 1), stats, logger) });
const opusFrames = (hz: number, count: number): Buffer[] => {
  const encoder = new OpusEncoder(48_000, 1);
  return sineFrames(hz, count).map((pcm) => encoder.encode(pcm));
};
const voice = (clientId: number, data: Buffer) => ({ clientId, data, codec: 4 as const });
const rms = (samples: Int16Array) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);

describe("WebRtcMixer", () => {
  it("keeps the RTP timeline running with a silent packet when no speaker has queued audio", () => {
    const packet = newMixer().mixer.mixNextFrame();
    expect(packet).not.toBeNull();
    expect(rms(decodeOpus([packet!]))).toBeLessThan(5);
  });

  it("encodes a lone 20 ms Opus frame at unit volume instead of forwarding the speaker's packet", () => {
    const { mixer } = newMixer();
    const [frame] = opusFrames(440, 1);
    mixer.pushTeamSpeakVoice(voice(7, frame!));
    const packet = mixer.mixNextFrame();
    expect(packet?.equals(frame!)).toBe(false);
    expect(rms(decodeOpus([packet!]))).toBeGreaterThan(1000);
    expect(mixer.getQueueFrameCount()).toBe(0);
  });

  // Upstream 7baeff0. Packets from the speaker and from the gateway's own encoder, interleaved on one RTP stream, left the
  // listener's decoder with the wrong history and it suppressed speech without any packet being lost.
  for (const scenario of ["silence gaps", "alternating speakers"] as const) {
    it(`keeps every tick audible for a listener decoding one continuous stream: ${scenario}`, () => {
      const { mixer } = newMixer();
      const sources = [new OpusEncoder(48_000, 1), new OpusEncoder(48_000, 1)];
      const listener = new OpusDecoder(48_000, 1);
      const heard = () => rms(new Int16Array(listener.decode(mixer.mixNextFrame()!).buffer.slice(0)));
      for (let tick = 0; tick < 50; tick++) heard();
      const quiet: number[] = [];
      sineFrames(440, 50).forEach((pcm, frame) => {
        const speaker = scenario === "alternating speakers" ? frame % 2 : 0;
        mixer.pushTeamSpeakVoice(voice(speaker + 2, sources[speaker]!.encode(pcm)));
        if (heard() <= 500) quiet.push(frame);
        if (scenario === "silence gaps") heard();
      });
      expect(quiet, `quiet ticks at frames ${quiet.join(",")}`).toEqual([]);
    });
  }

  it("re-encodes when the speaker volume is not 1, and silences at 0", () => {
    const { mixer } = newMixer();
    const [frame] = opusFrames(440, 3);
    mixer.setMemberVolume(7, 0);
    mixer.pushTeamSpeakVoice(voice(7, frame!));
    const packet = mixer.mixNextFrame();
    expect(packet).not.toBeNull();
    expect(packet!.equals(frame!)).toBe(false);
    expect(rms(decodeOpus([packet!]))).toBeLessThan(5);
  });

  it("mixes two speakers into one packet", () => {
    const { mixer } = newMixer();
    mixer.pushTeamSpeakVoice(voice(1, opusFrames(440, 1)[0]!));
    mixer.pushTeamSpeakVoice(voice(2, opusFrames(880, 1)[0]!));
    const packet = mixer.mixNextFrame();
    expect(packet).not.toBeNull();
    expect(rms(decodeOpus([packet!]))).toBeGreaterThan(1000);
    expect(mixer.getQueueFrameCount()).toBe(0);
  });

  it("caps each speaker queue at 4 frames and counts the drops", () => {
    const { mixer, stats } = newMixer();
    for (const frame of opusFrames(440, 6)) mixer.pushTeamSpeakVoice(voice(1, frame));
    expect(mixer.getQueueFrameCount()).toBe(4);
    expect(stats.webrtcQueueDroppedFrames).toBe(2);
    expect(stats.webrtcQueuePeakFrames).toBe(4);
  });

  it("keeps one frame per speaker after a late tick", () => {
    const { mixer, stats } = newMixer();
    for (const frame of opusFrames(440, 3)) mixer.pushTeamSpeakVoice(voice(1, frame));
    mixer.trimQueuesAfterLateTick();
    expect(mixer.getQueueFrameCount()).toBe(1);
    expect(stats.webrtcQueueDroppedFrames).toBe(2);
  });

  it("reports loud speakers once", () => {
    const { mixer } = newMixer();
    mixer.pushTeamSpeakVoice(voice(3, opusFrames(440, 1)[0]!));
    expect(mixer.takeActiveSpeakers()).toEqual([3]);
    expect(mixer.takeActiveSpeakers()).toEqual([]);
  });

  it("produces nothing after close", () => {
    const { mixer } = newMixer();
    mixer.pushTeamSpeakVoice(voice(1, opusFrames(440, 1)[0]!));
    mixer.close();
    expect(mixer.mixNextFrame()).toBeNull();
    expect(mixer.getQueueFrameCount()).toBe(0);
  });
});
