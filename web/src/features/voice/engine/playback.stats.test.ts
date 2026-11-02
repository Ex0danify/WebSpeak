// The WebSocket downlink has no RTP stats, so the room estimates jitter from frame arrivals and counts playback gaps.
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceHarness, type VoiceHarness } from "@/testSupport/harness";
import { FakeAudioContext, FakeAudioData, FakeAudioDecoder } from "@/testSupport/browserStubs";
import type { FakeWebSocket } from "@/testSupport/fakeWebsocket";

let harness: VoiceHarness;
let clock = 0;

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
  harness?.dispose();
  vi.restoreAllMocks();
});

function opusFrame(clientId: number): Uint8Array {
  const frame = new Uint8Array(11);
  frame[0] = 4;
  frame[1] = (clientId >> 8) & 0xff;
  frame[2] = clientId & 0xff;
  frame.fill(0xab, 3);
  return frame;
}

async function connected(): Promise<FakeWebSocket> {
  harness = await createVoiceHarness();
  const socket = await harness.joinAndConnect({
    members: [
      { id: 7, nickname: "Me" },
      { id: 9, nickname: "Ana" },
    ],
  });
  await flushPromises();
  return socket;
}

function speak(socket: FakeWebSocket, gaps: number[]): void {
  socket.receiveBinary(opusFrame(9));
  for (const gap of gaps) {
    clock += gap;
    socket.receiveBinary(opusFrame(9));
  }
}

describe("collectVoiceStats on the WebSocket downlink", () => {
  it("reports the transport and no loss, since the frames carry no sequence", async () => {
    await connected();
    const stats = await harness.voice.session.collectVoiceStats();
    expect(stats).toMatchObject({ transport: "websocket", lossPercent: null, rttMs: null, jitterMs: null, glitches: 0 });
  });

  it("is null while not connected", async () => {
    await connected();
    harness.voice.session.state.connected = false;
    expect(await harness.voice.session.collectVoiceStats()).toBeNull();
  });

  it("estimates jitter from uneven arrivals and stays at zero on a steady beat", async () => {
    const socket = await connected();
    speak(socket, Array(20).fill(20));
    expect((await harness.voice.session.collectVoiceStats())?.jitterMs).toBe(0);
    speak(socket, [2, 38, 2, 38, 2, 38, 2, 38, 2, 38, 2, 38]);
    expect((await harness.voice.session.collectVoiceStats())?.jitterMs).toBeGreaterThan(2);
  });

  it("counts playback that runs dry mid-sentence but not the start of a sentence", async () => {
    const socket = await connected();
    const ctx = FakeAudioContext.instances[0];
    ctx.currentTime = 1;
    speak(socket, [20, 20]);
    const [decoder] = FakeAudioDecoder.instances;
    decoder.init.output(new FakeAudioData());
    expect((await harness.voice.session.collectVoiceStats())?.glitches).toBe(0);
    ctx.currentTime = 5;
    clock += 5;
    decoder.init.output(new FakeAudioData());
    expect((await harness.voice.session.collectVoiceStats())?.glitches).toBe(1);
  });
});
