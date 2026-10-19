import { describe, expect, it, vi } from "vitest";
import { decodeOpus, powerAt, rms, sinePcmWireFrames } from "../../../../test/support/audio.js";
import { type Gateway, useGateway } from "../../../../test/support/gateway.js";
import { ask, joinVoice, type VoiceSession } from "../../../../test/support/voice.js";

const gateways = useGateway();

interface AudioCounters {
  ingressFrames: number;
  tsSendFrames: number;
  tsReceiveFrames: number;
  egressFrames: number;
  egressDroppedFrames: number;
  egressPeakBufferedBytes: number;
  egressFramesByClient: Record<string, number>;
}

/** The audio counters of the session of `nickname`, read the way the admin console reads them. */
async function counters(gateway: Gateway, nickname: string): Promise<AudioCounters> {
  const admin = await gateway.adminLogin();
  const { sessions } = (await (await admin.get("sessions")).json()) as { sessions: { nickname: string; audio: AudioCounters }[] };
  return sessions.find((session) => session.nickname === nickname)!.audio;
}

/** A frame from TeamSpeak is `[codec][clientId, 16 bit big endian][payload]`. */
const parseRelay = (frame: Buffer) => ({ codec: frame[0]!, clientId: frame.readUInt16BE(1), payload: frame.subarray(3) });

const settle = (session: VoiceSession) => ask(session, "sendTextMessage", { message: "" });

describe("TeamSpeak to browser: Opus relay", () => {
  it("relays a member's voice as [codec][clientId BE] plus the untouched payload", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob");
    const alice = await joinVoice(gateway, { nickname: "alice" });
    const payload = Buffer.from([1, 2, 3, 4, 5]);
    bob.speak(payload, 4);
    bob.speak(Buffer.from([9]), 2);
    const [first, second] = await alice.socket.waitForBinaryCount(2);
    expect(first).toEqual(Buffer.concat([Buffer.from([4, 0, bob.id]), payload]));
    expect(parseRelay(first!)).toMatchObject({ codec: 4, clientId: bob.id });
    expect(parseRelay(second!)).toMatchObject({ codec: 2, clientId: bob.id });
    expect(second).toHaveLength(4);
  });

  it("writes the client id as two big-endian bytes", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    alice.client.emit("voiceData", { clientId: 0x1234, codec: 4, data: Buffer.from([7]) });
    const [frame] = await alice.socket.waitForBinaryCount(1);
    expect([...frame!]).toEqual([4, 0x12, 0x34, 7]);
  });

  it("does not hand a session its own voice back, but still counts it as received", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    const bob = gateway.ts.addMember("bob");
    alice.client.emit("voiceData", { clientId: alice.id, codec: 4, data: Buffer.from([1]) });
    bob.speak(Buffer.from([2]));
    const frames = await alice.socket.waitForBinaryCount(1);
    expect(frames.map((frame) => parseRelay(frame).clientId)).toEqual([bob.id]);
    expect(await counters(gateway, "alice")).toMatchObject({ tsReceiveFrames: 2, egressFrames: 1, egressFramesByClient: { [bob.id]: 1 } });
  });

  it("carries a tone from one session to another: PCM in at alice, Opus out at bob, decodes to the same tone", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    const bob = await joinVoice(gateway, { nickname: "bob" });
    sinePcmWireFrames(880, 20).forEach((frame) => alice.socket.sendRaw(frame));
    const frames = (await bob.socket.waitForBinaryCount(20)).map(parseRelay);
    expect(frames.every((frame) => frame.clientId === alice.id && frame.codec === 4)).toBe(true);
    const samples = decodeOpus(frames.slice(10).map((frame) => frame.payload));
    expect(rms(samples)).toBeGreaterThan(4000);
    expect(powerAt(samples, 880)).toBeGreaterThan(50 * powerAt(samples, 440));
    expect(alice.socket.binary).toEqual([]);
  });

  it("keeps the counters of both sides in step with what was sent", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    const bob = await joinVoice(gateway, { nickname: "bob" });
    const carol = gateway.ts.addMember("carol");
    sinePcmWireFrames(440, 12).forEach((frame) => alice.socket.sendRaw(frame));
    for (let i = 0; i < 5; i++) carol.speak(Buffer.from([i]));
    await bob.socket.waitForBinaryCount(17);
    await settle(alice);
    expect(await counters(gateway, "alice")).toMatchObject({
      ingressFrames: 12,
      tsSendFrames: 12,
      tsReceiveFrames: 5,
      egressFrames: 5,
      egressDroppedFrames: 0,
      egressFramesByClient: { [carol.id]: 5 },
    });
    expect(await counters(gateway, "bob")).toMatchObject({
      ingressFrames: 0,
      tsSendFrames: 0,
      tsReceiveFrames: 17,
      egressFrames: 17,
      egressDroppedFrames: 0,
      egressFramesByClient: { [alice.id]: 12, [carol.id]: 5 },
    });
  });
});

describe("the egress byte guard", () => {
  const PAYLOAD_BYTES = 60_000;
  const GUARD_BYTES = 4_096;

  it("drops and counts frames while the browser is not reading, instead of queueing without limit, and relays again once it reads", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob");
    const alice = await joinVoice(gateway, { nickname: "alice" });
    alice.socket.pauseReading();
    const big = Buffer.alloc(PAYLOAD_BYTES, 1);
    let sent = 0;
    let audio = await counters(gateway, "alice");
    // The kernel buffers absorb a few megabytes first; keep going until the guard has had to act.
    for (let batch = 0; batch < 20 && audio.egressDroppedFrames === 0; batch++) {
      for (let i = 0; i < 50; i++) {
        bob.speak(big);
        sent++;
      }
      audio = await counters(gateway, "alice");
    }
    expect(audio.egressDroppedFrames).toBeGreaterThan(0);
    expect(audio.tsReceiveFrames).toBe(sent);
    expect(audio.egressFrames + audio.egressDroppedFrames).toBe(sent);
    // One frame is in flight when the guard trips, so the queue never grows past it.
    expect(audio.egressPeakBufferedBytes).toBeLessThanOrEqual(GUARD_BYTES + 3 + PAYLOAD_BYTES);
    // Everything after the guard tripped was dropped, so most of what was sent never queued.
    expect(audio.egressFrames).toBeLessThan(sent);

    alice.socket.resumeReading();
    const marker = Buffer.from([0xaa, 0xbb]);
    await vi.waitFor(
      () => {
        bob.speak(marker);
        expect(alice.socket.binary.some((frame) => frame.length === 5 && frame.subarray(3).equals(marker))).toBe(true);
      },
      { timeout: 5000 },
    );
  });
});
