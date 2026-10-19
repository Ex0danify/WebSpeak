// Characterization of the audio hot path through the public API. Uplink is worklet frame, VOX gate, Int16 conversion,
// 960-sample framing, socket. Downlink is binary Opus frame, per-client decoder, scheduled playback. Every number below is
// behavior to keep.
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createVoiceHarness, type VoiceHarness } from "@/testSupport/harness";
import {
  FakeAudioContext,
  FakeAudioData,
  FakeAudioDecoder,
  FakeAudioWorkletNode,
  FakeMediaStream,
  FakeMediaStreamTrack,
} from "@/testSupport/browserStubs";
import type { FakeWebSocket } from "@/testSupport/fakeWebsocket";

let harness: VoiceHarness;

afterEach(() => harness?.dispose());

async function liveMicrophone(): Promise<{ socket: FakeWebSocket; worklet: FakeAudioWorkletNode }> {
  harness = await createVoiceHarness({ getUserMedia: async () => new FakeMediaStream([new FakeMediaStreamTrack("audio")]) });
  harness.voice.audio.noiseSuppressionEnabled.value = false;
  const socket = await harness.joinAndConnect();
  await flushPromises();
  socket.sent.length = 0;
  const worklet = FakeAudioWorkletNode.instances.at(-1);
  if (!worklet) throw new Error("the capture worklet was not created");
  return { socket, worklet };
}

function capture(worklet: FakeAudioWorkletNode, samples: Float32Array, rms?: number): void {
  worklet.port.onmessage?.({ data: { samples, rms } });
}

const constant = (value: number, length = 960): Float32Array => new Float32Array(length).fill(value);
// Each uplink frame is a 1-byte codec tag (0 = PCM) followed by the Int16 payload; drop the tag to read the samples.
const frames = (socket: FakeWebSocket): Int16Array[] =>
  socket.sentBinary.map((frame) => new Int16Array(new Uint8Array(frame as ArrayBuffer).slice(1).buffer));

describe("uplink: VOX gate", () => {
  it("opens at once on a loud frame (attack of one frame) and stays closed on silence", async () => {
    const { socket, worklet } = await liveMicrophone();
    capture(worklet, constant(0));
    expect(socket.sentBinary).toHaveLength(0);
    capture(worklet, constant(0.5));
    expect(socket.sentBinary).toHaveLength(1);
  });

  it("uses the configurable threshold on the RMS of the first 256 samples", async () => {
    const { socket, worklet } = await liveMicrophone();
    harness.voice.audio.setVoxThreshold(0.1);
    capture(worklet, constant(0.05));
    expect(socket.sentBinary).toHaveLength(0);
    const quietHead = new Float32Array(960);
    quietHead.fill(0.9, 256);
    capture(worklet, quietHead);
    expect(socket.sentBinary).toHaveLength(0);
    capture(worklet, constant(0.1));
    expect(socket.sentBinary).toHaveLength(1);
  });

  it("holds the gate open for 15 silent frames after speech, then closes", async () => {
    const { socket, worklet } = await liveMicrophone();
    capture(worklet, constant(0.5));
    for (let i = 0; i < 15; i++) capture(worklet, constant(0));
    expect(socket.sentBinary).toHaveLength(16);
    capture(worklet, constant(0));
    expect(socket.sentBinary).toHaveLength(16);
  });

  it("a loud frame during the hold restarts the hold", async () => {
    const { socket, worklet } = await liveMicrophone();
    capture(worklet, constant(0.5));
    for (let i = 0; i < 10; i++) capture(worklet, constant(0));
    capture(worklet, constant(0.5));
    for (let i = 0; i < 15; i++) capture(worklet, constant(0));
    capture(worklet, constant(0));
    expect(socket.sentBinary).toHaveLength(1 + 10 + 1 + 15);
  });

  it("sends nothing while muted, however loud", async () => {
    const { socket, worklet } = await liveMicrophone();
    void harness.voice.audio.setMicrophoneMuted(true).catch(() => undefined);
    socket.sent.length = 0;
    capture(worklet, constant(0.9));
    expect(socket.sentBinary).toHaveLength(0);
  });

  it("updates micLevel from every capture chunk: min(1, rms * 6), or the chunk's own RMS when the worklet omits it", async () => {
    const { worklet } = await liveMicrophone();
    capture(worklet, constant(0.5), 0.1);
    expect(harness.voice.audio.micLevel.value).toBeCloseTo(0.6);
    capture(worklet, constant(0.5), 0.5);
    expect(harness.voice.audio.micLevel.value).toBe(1);
    capture(worklet, constant(0.05));
    expect(harness.voice.audio.micLevel.value).toBeCloseTo(0.3);
  });
});

describe("uplink: frame assembler", () => {
  it("sends each 960-sample worklet frame as one tagged 1921-byte Int16 frame", async () => {
    const { socket, worklet } = await liveMicrophone();
    capture(worklet, constant(0.5));
    expect(socket.sentBinary).toHaveLength(1);
    expect((socket.sentBinary[0] as ArrayBuffer).byteLength).toBe(1921);
    expect(new Uint8Array(socket.sentBinary[0] as ArrayBuffer)[0]).toBe(0);
  });

  it("converts Float32 to Int16 asymmetrically and clips out-of-range samples", async () => {
    const { socket, worklet } = await liveMicrophone();
    const samples = constant(0.5);
    samples.set([1, -1, 2, -2, 0.5, -0.5, 0]);
    capture(worklet, samples);
    const [frame] = frames(socket);
    expect([...frame.subarray(0, 7)]).toEqual([32767, -32768, 32767, -32768, 16383, -16384, 0]);
  });

  it("reframes 1024-sample chunks (ScriptProcessor size) into 960-sample frames without losing a sample", async () => {
    const { socket, worklet } = await liveMicrophone();
    for (let chunk = 0; chunk < 15; chunk++) capture(worklet, constant(0.5, 1024));
    // 15 * 1024 = 16 * 960
    expect(socket.sentBinary).toHaveLength(16);
    expect(frames(socket).every((frame) => frame.length === 960)).toBe(true);
  });

  it("carries the remainder of a chunk into the next frame in order", async () => {
    const { socket, worklet } = await liveMicrophone();
    // (n + 0.5) / 32767 converts to exactly the Int16 value n; the level stays above the VOX threshold.
    const ramp = (start: number, length: number): Float32Array => Float32Array.from({ length }, (_, i) => (start + i + 0.5) / 32767);
    capture(worklet, ramp(4000, 1024));
    capture(worklet, ramp(5024, 1024));
    const [first, second] = frames(socket);
    expect(first[0]).toBe(4000);
    expect(first[959]).toBe(4959);
    expect(second[0]).toBe(4960);
    expect(second[63]).toBe(5023);
    expect(second[64]).toBe(5024);
  });

  it("marks the own client as speaking after sending", async () => {
    const { worklet } = await liveMicrophone();
    capture(worklet, constant(0.5));
    expect(harness.voice.roster.speakingIds.has(7)).toBe(true);
  });
});

describe("uplink: buffer cap", () => {
  it("drops the chunk and forgets any pending remainder when the socket buffers more than 10 frames (19200 bytes)", async () => {
    const { socket, worklet } = await liveMicrophone();
    capture(worklet, constant(0.25, 1024));
    expect(socket.sentBinary).toHaveLength(1);
    socket.bufferedAmount = 19201;
    capture(worklet, constant(0.25, 1024));
    expect(socket.sentBinary).toHaveLength(1);
    socket.bufferedAmount = 0;
    capture(worklet, constant(0.5));
    expect(socket.sentBinary).toHaveLength(2);
    expect(new Set(frames(socket)[1])).toEqual(new Set([16383]));
  });

  it("still sends at exactly 19200 buffered bytes", async () => {
    const { socket, worklet } = await liveMicrophone();
    socket.bufferedAmount = 19200;
    capture(worklet, constant(0.5));
    expect(socket.sentBinary).toHaveLength(1);
  });

  it("stops mid-chunk once the socket reports more than 19200 buffered bytes", async () => {
    const { socket, worklet } = await liveMicrophone();
    socket.accumulateBuffered = true;
    capture(worklet, constant(0.5, 960 * 20));
    // Sends while bufferedAmount <= 19200: each tagged frame is 1921 bytes, so the 10th leaves 19210 buffered and the 11th is dropped.
    expect(socket.sentBinary).toHaveLength(10);
  });

  it("sends nothing over WebRTC (the PCM path is bypassed)", async () => {
    harness = await createVoiceHarness({ getUserMedia: async () => new FakeMediaStream([new FakeMediaStreamTrack("audio")]) });
    harness.voice.audio.noiseSuppressionEnabled.value = false;
    const socket = await harness.joinAndConnect({ webrtcAvailable: true });
    await flushPromises();
    socket.receive({ type: "webrtcAnswer", payload: { sdp: { type: "answer", sdp: "remote" } } });
    await flushPromises();
    socket.sent.length = 0;
    const worklet = FakeAudioWorkletNode.instances.at(-1);
    if (worklet) capture(worklet, constant(0.9));
    expect(socket.sentBinary).toHaveLength(0);
  });
});

function opusFrame(clientId: number, payloadLength = 8, codec = 4): Uint8Array {
  const frame = new Uint8Array(3 + payloadLength);
  frame[0] = codec;
  frame[1] = (clientId >> 8) & 0xff;
  frame[2] = clientId & 0xff;
  frame.fill(0xab, 3);
  return frame;
}

async function downlink(): Promise<{ socket: FakeWebSocket; ctx: () => FakeAudioContext }> {
  harness = await createVoiceHarness();
  const socket = await harness.joinAndConnect({
    members: [
      { id: 7, nickname: "Me" },
      { id: 9, nickname: "Ana" },
      { id: 10, nickname: "Ben" },
    ],
  });
  await flushPromises();
  return { socket, ctx: () => FakeAudioContext.instances[0] };
}

describe("downlink: routing", () => {
  it("creates one configured decoder per remote client and decodes 20 ms chunks with rising timestamps", async () => {
    const { socket } = await downlink();
    socket.receiveBinary(opusFrame(9));
    socket.receiveBinary(opusFrame(9));
    socket.receiveBinary(opusFrame(10));
    expect(FakeAudioDecoder.instances).toHaveLength(2);
    const [ana, ben] = FakeAudioDecoder.instances;
    expect(ana.configured).toEqual({ codec: "opus", sampleRate: 48000, numberOfChannels: 1 });
    expect(ana.chunks.map((chunk) => (chunk as { init: { timestamp: number; duration: number; type: string } }).init)).toMatchObject([
      { type: "key", timestamp: 0, duration: 20_000 },
      { type: "key", timestamp: 20_000, duration: 20_000 },
    ]);
    expect(ben.chunks).toHaveLength(1);
  });

  it("strips the 3-byte header and marks the sender as speaking", async () => {
    const { socket } = await downlink();
    socket.receiveBinary(opusFrame(9, 5));
    const chunk = FakeAudioDecoder.instances[0].chunks[0] as { init: { data: Uint8Array } };
    expect(chunk.init.data).toEqual(new Uint8Array(5).fill(0xab));
    expect(harness.voice.roster.speakingIds.has(9)).toBe(true);
  });

  it("ignores frames shorter than 4 bytes, payloads under 3 bytes, and the own client's echo", async () => {
    const { socket } = await downlink();
    socket.receiveBinary(new Uint8Array([4, 0, 9]));
    socket.receiveBinary(opusFrame(9, 2));
    socket.receiveBinary(opusFrame(7));
    expect(FakeAudioDecoder.instances).toHaveLength(0);
    expect(harness.voice.roster.speakingIds.has(7)).toBe(false);
  });

  it("gives each client a gain node scaled by the member volume and the output volume", async () => {
    const { socket, ctx } = await downlink();
    harness.voice.audio.setVolume(9, 0.5);
    harness.voice.audio.setOutputVolume(0.5);
    socket.receiveBinary(opusFrame(9));
    const gain = ctx().gains.at(-1)!;
    expect(gain.gain.value).toBeCloseTo(0.25);
    expect(gain.connections).toContain(ctx().destination);
  });

  it("is ignored while WebRTC carries the downlink", async () => {
    harness = await createVoiceHarness({ getUserMedia: async () => new FakeMediaStream([new FakeMediaStreamTrack("audio")]) });
    harness.voice.audio.noiseSuppressionEnabled.value = false;
    const socket = await harness.joinAndConnect({ webrtcAvailable: true });
    await flushPromises();
    socket.receive({ type: "webrtcAnswer", payload: { sdp: { type: "answer", sdp: "remote" } } });
    await flushPromises();
    socket.receiveBinary(opusFrame(9));
    expect(FakeAudioDecoder.instances).toHaveLength(0);
  });

  it("closes a leaving member's decoder", async () => {
    const { socket } = await downlink();
    socket.receiveBinary(opusFrame(9));
    socket.receive({ type: "memberLeave", id: 9 });
    expect(FakeAudioDecoder.instances[0].state).toBe("closed");
  });
});

describe("downlink: scheduling", () => {
  function decoded(decoder: FakeAudioDecoder, data = new FakeAudioData()): FakeAudioData {
    decoder.init.output(data);
    return data;
  }

  it("schedules consecutive frames back to back from the context clock", async () => {
    const { socket, ctx } = await downlink();
    ctx().currentTime = 1;
    socket.receiveBinary(opusFrame(9));
    const [decoder] = FakeAudioDecoder.instances;
    const first = decoded(decoder);
    decoded(decoder);
    const starts = ctx().bufferSources.flatMap((source) => source.started);
    expect(starts[0]).toBe(1);
    expect(starts[1]).toBeCloseTo(1.02);
    expect(first.closed).toBe(true);
  });

  it("starts at 'now' when playback has fallen behind the clock", async () => {
    const { socket, ctx } = await downlink();
    ctx().currentTime = 1;
    socket.receiveBinary(opusFrame(9));
    const [decoder] = FakeAudioDecoder.instances;
    decoded(decoder);
    ctx().currentTime = 5;
    decoded(decoder);
    expect(ctx().bufferSources.map((source) => source.started[0])).toEqual([1, 5]);
  });

  it("schedules four 20 ms frames within the 80 ms play-ahead limit and resets instead of scheduling a fifth", async () => {
    const { socket, ctx } = await downlink();
    ctx().currentTime = 0;
    socket.receiveBinary(opusFrame(9));
    const [decoder] = FakeAudioDecoder.instances;
    for (let i = 0; i < 4; i++) decoded(decoder);
    const scheduled = () => ctx().bufferSources.filter((source) => source.started.length > 0).length;
    expect(scheduled()).toBe(4);
    const late = new FakeAudioData();
    decoded(decoder, late);
    expect(scheduled()).toBe(4);
    expect(late.closed).toBe(true);
    expect(decoder.state).toBe("closed");
  });

  it("after a reset the next frame starts a fresh decoder generation and ignores the old one's late output", async () => {
    const { socket, ctx } = await downlink();
    socket.receiveBinary(opusFrame(9));
    const [old] = FakeAudioDecoder.instances;
    old.decodeQueueSize = 3;
    socket.receiveBinary(opusFrame(9));
    expect(FakeAudioDecoder.instances).toHaveLength(2);
    expect(old.state).toBe("closed");
    const sourcesBefore = ctx().bufferSources.length;
    const stale = new FakeAudioData();
    old.init.output(stale);
    expect(stale.closed).toBe(true);
    expect(ctx().bufferSources).toHaveLength(sourcesBefore);
    expect(FakeAudioDecoder.instances[1].chunks).toHaveLength(1);
  });

  it("resets when 3 frames are already queued in the decoder, and not at 2", async () => {
    const { socket } = await downlink();
    socket.receiveBinary(opusFrame(9));
    FakeAudioDecoder.instances[0].decodeQueueSize = 2;
    socket.receiveBinary(opusFrame(9));
    expect(FakeAudioDecoder.instances).toHaveLength(1);
    FakeAudioDecoder.instances[0].decodeQueueSize = 3;
    socket.receiveBinary(opusFrame(9));
    expect(FakeAudioDecoder.instances).toHaveLength(2);
  });

  it("drops a client's decoder when it reports an error, so the next frame starts over", async () => {
    const { socket } = await downlink();
    socket.receiveBinary(opusFrame(9));
    FakeAudioDecoder.instances[0].init.error(new Error("decode failed"));
    socket.receiveBinary(opusFrame(9));
    expect(FakeAudioDecoder.instances).toHaveLength(2);
  });

  it("stops scheduled sources of a client when its playback is cleared", async () => {
    const { socket, ctx } = await downlink();
    socket.receiveBinary(opusFrame(9));
    decoded(FakeAudioDecoder.instances[0]);
    socket.receive({ type: "memberLeave", id: 9 });
    expect(ctx().bufferSources[0].stopped).toBe(true);
  });

  it("keeps clients independent: one client's reset leaves another's decoder alone", async () => {
    const { socket } = await downlink();
    socket.receiveBinary(opusFrame(9));
    socket.receiveBinary(opusFrame(10));
    FakeAudioDecoder.instances[0].decodeQueueSize = 3;
    socket.receiveBinary(opusFrame(9));
    expect(FakeAudioDecoder.instances[1].state).toBe("configured");
    expect(FakeAudioDecoder.instances).toHaveLength(3);
  });
});
