import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeOpus, FRAME_BYTES, powerAt, rms, silentFrame, sineFrames } from "../../../../test/helpers/audio.js";
import { FakeTeamSpeakServer } from "../../../../test/helpers/fakeTsClient.js";
import { type Gateway, useGateway } from "../../../../test/helpers/gateway.js";
import { ask, errorOf, joinVoice, type VoiceSession } from "../../../../test/helpers/voice.js";

const gateways = useGateway();
afterEach(() => vi.restoreAllMocks());

interface AudioCounters {
  ingressFrames: number;
  ingressDroppedFrames: number;
  tsSendFrames: number;
  tsSendErrors: number;
  tsReceiveFrames: number;
  egressFrames: number;
  egressDroppedFrames: number;
  egressFramesByClient: Record<string, number>;
}

/** The audio counters of the session of `nickname`, read the way the admin console reads them. */
async function counters(gateway: Gateway, nickname: string): Promise<AudioCounters> {
  const admin = await gateway.adminLogin();
  const { sessions } = (await (await admin.get("sessions")).json()) as { sessions: { nickname: string; audio: AudioCounters }[] };
  return sessions.find((session) => session.nickname === nickname)!.audio;
}

/**
 * The gateway handles the frames of one socket in order, so once a command that
 * changes nothing has been answered, every frame sent before it has been handled.
 */
const settle = (session: VoiceSession) => ask(session, "sendTextMessage", { message: "" });

const sendFrames = (session: VoiceSession, frames: Buffer[]) => frames.forEach((frame) => session.socket.sendRaw(frame));

describe("browser to TeamSpeak: PCM in, Opus out", () => {
  it("turns each 1,920-byte frame into one Opus packet sent as codec 4, and the packets decode to the tone that was sent", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    sendFrames(alice, sineFrames(440, 20));
    await settle(alice);
    expect(alice.client.sentVoice).toHaveLength(20);
    expect(alice.client.sentVoice.every((sent) => sent.codec === 4)).toBe(true);
    expect(alice.client.sentWhispers).toEqual([]);
    // Opus needs a few frames to settle, so judge the second half.
    const samples = decodeOpus(alice.client.sentVoice.slice(10).map((sent) => sent.data));
    expect(samples).toHaveLength(10 * 960);
    expect(rms(samples)).toBeGreaterThan(4000);
    expect(powerAt(samples, 440)).toBeGreaterThan(50 * powerAt(samples, 1000));
    expect(powerAt(samples, 440)).toBeGreaterThan(50 * powerAt(samples, 200));
  });

  it("encodes a silent microphone as silence, not as a tone", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    sendFrames(alice, Array.from({ length: 10 }, silentFrame));
    await settle(alice);
    expect(alice.client.sentVoice).toHaveLength(10);
    expect(rms(decodeOpus(alice.client.sentVoice.map((sent) => sent.data)))).toBeLessThan(10);
  });

  it("sends the frames to the whisper targets instead of the channel while a whisper is active", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 2n);
    const alice = await joinVoice(gateway, { nickname: "alice" });
    alice.socket.send({ type: "setWhisperTargets", payload: { targetIds: [bob.id] } });
    alice.socket.send({ type: "setWhisperActive", payload: { active: true } });
    await alice.socket.waitForMessage((message) => message.type === "whisperTargets" && message.active === true);
    sendFrames(alice, sineFrames(440, 3));
    await settle(alice);
    expect(alice.client.sentVoice).toEqual([]);
    expect(alice.client.sentWhispers.map((sent) => [sent.clientIds, sent.codec])).toEqual([[[bob.id], 4], [[bob.id], 4], [[bob.id], 4]]);
  });

  it("drops a frame of any other size, answers INVALID_AUDIO_FRAME once and counts each, and keeps accepting good frames", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    const [good] = sineFrames(440, 1);
    const bad = [Buffer.alloc(0), Buffer.alloc(1), Buffer.alloc(FRAME_BYTES - 1), Buffer.alloc(FRAME_BYTES + 1), Buffer.alloc(2 * FRAME_BYTES)];
    const after = alice.socket.mark();
    sendFrames(alice, [...bad, good!]);
    await settle(alice);
    const errors = alice.socket.messages.slice(after).filter((message) => message.type === "error");
    expect(errors.map((message) => errorOf(message).code)).toEqual(["INVALID_AUDIO_FRAME"]);
    expect(alice.client.sentVoice).toHaveLength(1);
    expect(await counters(gateway, "alice")).toMatchObject({ ingressFrames: 1, ingressDroppedFrames: bad.length, tsSendFrames: 1, tsSendErrors: 0 });
  });

  it("drops a frame that arrives before TeamSpeak has connected and counts it", async () => {
    const gateway = await gateways.start();
    const release = gateway.ts.holdConnects();
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    socket.sendRaw(sineFrames(440, 1)[0]!);
    await vi.waitFor(async () => expect(await counters(gateway, "alice")).toMatchObject({ ingressDroppedFrames: 1 }));
    release();
    await socket.waitForMessage("connected");
    expect(gateway.ts.created[0]!.sentVoice).toEqual([]);
    expect(await counters(gateway, "alice")).toMatchObject({ ingressFrames: 0, ingressDroppedFrames: 1 });
  });

  it("RV6: drops frames silently while TeamSpeak is not ready, counting them without answering each one", async () => {
    const gateway = await gateways.start();
    const release = gateway.ts.holdConnects();
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    const frames = sineFrames(440, 5);
    frames.forEach((frame) => socket.sendRaw(frame));
    await vi.waitFor(async () => expect(await counters(gateway, "alice")).toMatchObject({ ingressDroppedFrames: 5 }));
    release();
    await socket.waitForMessage("connected");
    expect(socket.messages.filter((message) => message.type === "error")).toEqual([]);
    expect(await counters(gateway, "alice")).toMatchObject({ ingressFrames: 0, ingressDroppedFrames: 5 });
  });

  it("RV6: answers a wrong frame length with INVALID_AUDIO_FRAME at most once per 5 s", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    const after = alice.socket.mark();
    sendFrames(alice, Array.from({ length: 5 }, () => Buffer.alloc(FRAME_BYTES - 1)));
    await settle(alice);
    const errors = alice.socket.messages.slice(after).filter((message) => message.type === "error");
    expect(errors).toHaveLength(1);
    expect(await counters(gateway, "alice")).toMatchObject({ ingressDroppedFrames: 5 });
  });

  it("has no uplink cap of its own: a burst of 25 frames all go to TeamSpeak (the 10-frame cap lives in the browser)", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    sendFrames(alice, sineFrames(440, 25));
    await settle(alice);
    expect(alice.client.sentVoice).toHaveLength(25);
    expect(await counters(gateway, "alice")).toMatchObject({ ingressFrames: 25, ingressDroppedFrames: 0, tsSendFrames: 25 });
  });

  it("counts a frame that TeamSpeak refuses as a send error, and carries on with the next", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    vi.spyOn(alice.client, "sendVoice").mockImplementationOnce(() => { throw new Error("session is closing"); });
    sendFrames(alice, sineFrames(440, 2));
    await settle(alice);
    expect(alice.client.sendVoice).toHaveBeenCalledTimes(2);
    expect(await counters(gateway, "alice")).toMatchObject({ ingressFrames: 2, tsSendFrames: 1, tsSendErrors: 1 });
  });
});
