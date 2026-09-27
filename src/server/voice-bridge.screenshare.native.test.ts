import { describe, expect, it } from "vitest";
import { type Gateway, useGateway } from "../../test/helpers/gateway.js";
import { ask, joinVoice, type VoiceSession } from "../../test/helpers/voice.js";
import type { JsonMessage } from "../../test/helpers/ws-client.js";

const gateways = useGateway();

const STREAM_ID = "ts-stream-1";

/** TeamSpeak sends a raw notification to every gateway session on the server; this does the same. */
function notify(sessions: VoiceSession[], name: string, params: Record<string, string>): void {
  for (const session of sessions) session.client.emit("rawNotification", { name, params });
}

/** A TeamSpeak user who shares a screen, and two gateway sessions in the same channel that see it. */
async function nativeShare(gateway: Gateway, params: Record<string, string> = {}) {
  const source = gateway.ts.addMember("tsuser");
  const viewer = await joinVoice(gateway, { nickname: "viewer" });
  const other = await joinVoice(gateway, { nickname: "other" });
  const sessions = [viewer, other];
  const mark = await markOf(viewer);
  notify(sessions, "notifystreamstarted", { id: STREAM_ID, clid: String(source.id), name: "Raid night", audio: "1", ...params });
  const started = await viewer.socket.waitForMessage("screenShareStarted", { after: mark });
  return { source, viewer, other, sessions, started, stream: started.stream as { streamId: string; ownerPeerId: string } };
}

async function markOf(session: VoiceSession): Promise<number> {
  await ask(session, "sendTextMessage", { message: "" });
  return session.socket.mark();
}

/** The screen share messages received since `after`, once the gateway has answered a no-op. */
async function received(session: VoiceSession, after: number): Promise<JsonMessage[]> {
  await ask(session, "sendTextMessage", { message: "" });
  return session.socket.messages.slice(after).filter((message) => message.type.startsWith("screenShare"));
}

async function share(session: VoiceSession, type: string, payload: Record<string, unknown> = {}): Promise<JsonMessage> {
  const requestId = `q-${Math.random().toString(36).slice(2)}`;
  const after = session.socket.mark();
  session.socket.send({ type, requestId, ...payload } as never);
  return session.socket.waitForMessage((message) => message.requestId === requestId, { after });
}

const join = (session: VoiceSession) => share(session, "screenShareJoin", { streamId: STREAM_ID });
const signalTo = (session: VoiceSession, targetPeerId: string, signal: Record<string, unknown>) => {
  const after = session.socket.mark();
  session.socket.send({ type: "screenShareSignal", streamId: STREAM_ID, targetPeerId, signal } as never);
  return after;
};

describe("a stream that a TeamSpeak user starts", () => {
  it("becomes one card for each browser in the channel, however many sessions see the notification", async () => {
    const gateway = await gateways.start();
    const { source, viewer, other, started } = await nativeShare(gateway);
    expect(started).toEqual({
      type: "screenShareStarted",
      owner: false,
      stream: { streamId: STREAM_ID, source: "teamspeak", ownerPeerId: `ts-${source.id}`, ownerClientId: source.id, ownerNickname: "Raid night", name: "Raid night", audio: true, createdAt: expect.any(Number), viewerCount: 0, viewers: [] },
    });
    for (const session of [viewer, other]) {
      expect((await received(session, 0)).filter((message) => message.type === "screenShareStarted")).toHaveLength(1);
    }
  });

  it("gets a default name and no audio when TeamSpeak gives none, and an update changes the card without announcing it again", async () => {
    const gateway = await gateways.start();
    const { source, viewer, sessions, stream } = await nativeShare(gateway, { name: "", audio: "0" });
    expect(stream).toMatchObject({ name: "TeamSpeak 屏幕共享", ownerNickname: `TeamSpeak 用户 ${source.id}`, audio: false });
    const mark = await markOf(viewer);
    notify(sessions, "notifystreaminfo", { id: STREAM_ID, clid: String(source.id), name: "Renamed", audio: "1" });
    const list = async () => {
      viewer.socket.send({ type: "screenShareList" });
      return (await viewer.socket.waitForMessage("screenShareList", { after: mark })).streams;
    };
    expect(await list()).toMatchObject([{ streamId: STREAM_ID, name: "Renamed", ownerNickname: "Renamed", audio: true }]);
    expect((await received(viewer, mark)).filter((message) => message.type === "screenShareStarted")).toEqual([]);
  });

  it("is ignored without a stream id or a source client", async () => {
    const gateway = await gateways.start();
    const source = gateway.ts.addMember("tsuser");
    const viewer = await joinVoice(gateway, { nickname: "viewer" });
    const mark = await markOf(viewer);
    notify([viewer], "notifystreamstarted", { clid: String(source.id) });
    notify([viewer], "notifystreamstarted", { id: STREAM_ID });
    notify([viewer], "notifystreamstarted", { id: STREAM_ID, clid: "abc" });
    notify([viewer], "notifystreamstarted", { id: STREAM_ID, clid: "0" });
    expect(await received(viewer, mark)).toEqual([]);
  });

  it("ends when its source stops it, leaves the server or moves to another channel, and tells the viewers why", async () => {
    const cases: [string, (context: Awaited<ReturnType<typeof nativeShare>>) => void][] = [
      ["source-stopped", ({ sessions }) => notify(sessions, "notifystreamstopped", { id: STREAM_ID })],
      ["source-left", ({ source }) => source.leave()],
      ["source-moved-channel", ({ source }) => source.moveTo(3n)],
    ];
    for (const [reason, end] of cases) {
      const context = await nativeShare(await gateways.start());
      await join(context.viewer);
      const mark = await markOf(context.viewer);
      end(context);
      expect(await received(context.viewer, mark)).toEqual(expect.arrayContaining([{ type: "screenShareStopped", streamId: STREAM_ID, reason }]));
      expect(await share(context.other, "screenShareJoin", { streamId: STREAM_ID })).toMatchObject({ code: "SCREEN_SHARE_NOT_FOUND" });
    }
  });
});

describe("watching a stream that a TeamSpeak user shares", () => {
  it("asks the source for the stream with joinstreamrequest, and tells the viewer the mode and the source's peer id", async () => {
    const gateway = await gateways.start();
    const { source, viewer } = await nativeShare(gateway);
    expect(await join(viewer)).toMatchObject({ type: "screenShareJoined", mode: "teamspeak", ownerPeerId: `ts-${source.id}`, stream: { streamId: STREAM_ID, viewerCount: 1, viewers: [{ nickname: "viewer" }] } });
    expect(viewer.client.protocolCommands).toContain(`joinstreamrequest id=${STREAM_ID} clid=${source.id} msg= is_remove=0 muted=0 volume=0 hidden=0`);
  });

  it("gives the viewer up again when the request fails, and says why", async () => {
    const gateway = await gateways.start();
    const { viewer } = await nativeShare(gateway);
    gateway.ts.onProtocolCommand = (command) => { if (command.startsWith("joinstreamrequest")) throw new Error("stream is full"); };
    const mark = await markOf(viewer);
    viewer.socket.send({ type: "screenShareJoin", requestId: "j1", streamId: STREAM_ID } as never);
    expect(await viewer.socket.waitForMessage("screenShareError", { after: mark })).toMatchObject({ requestId: "j1", code: "SCREEN_SHARE_JOIN_FAILED", message: "stream is full" });
    expect((await received(viewer, mark)).map((message) => message.type)).toContain("screenShareLeft");
    viewer.socket.send({ type: "screenShareList" });
    expect((await viewer.socket.waitForMessage("screenShareList", { after: mark })).streams).toMatchObject([{ viewerCount: 0, viewers: [] }]);
  });

  it("sends the viewer's answer and ICE candidates to the source as streamsignaling", async () => {
    const gateway = await gateways.start();
    const { source, viewer } = await nativeShare(gateway);
    await join(viewer);
    const peer = `ts-${source.id}`;
    signalTo(viewer, peer, { kind: "answer", sdp: "v=0" });
    signalTo(viewer, peer, { kind: "iceCandidate", candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 });
    signalTo(viewer, peer, { kind: "iceCandidate", candidate: "candidate:2" });
    await ask(viewer, "sendTextMessage", { message: "" });
    expect(viewer.client.protocolCommands.filter((command) => command.startsWith("streamsignaling"))).toEqual([
      `streamsignaling id=${STREAM_ID} clid=${source.id} json={"cmd":"answer","args":{"answer":"v=0"}}`,
      `streamsignaling id=${STREAM_ID} clid=${source.id} json={"cmd":"iceCandidate","args":{"sdp":"candidate:1","mid":"0","mLine":0}}`,
      `streamsignaling id=${STREAM_ID} clid=${source.id} json={"cmd":"iceCandidate","args":{"sdp":"candidate:2"}}`,
    ]);
  });

  it("refuses an offer to the source, a signal to anyone else, and a signal from a session that has not joined", async () => {
    const gateway = await gateways.start();
    const { source, viewer, other } = await nativeShare(gateway);
    await join(viewer);
    const peer = `ts-${source.id}`;
    const errorAfter = async (session: VoiceSession, after: number) => (await session.socket.waitForMessage("screenShareError", { after })).code;
    expect(await errorAfter(viewer, signalTo(viewer, peer, { kind: "offer", sdp: "v=0" }))).toBe("SCREEN_SHARE_INVALID_SIGNAL");
    expect(await errorAfter(viewer, signalTo(viewer, "w-somebody", { kind: "answer", sdp: "v=0" }))).toBe("SCREEN_SHARE_SIGNAL_FORBIDDEN");
    expect(await errorAfter(other, signalTo(other, peer, { kind: "answer", sdp: "v=0" }))).toBe("SCREEN_SHARE_SIGNAL_FORBIDDEN");
    expect([viewer, other].flatMap((session) => session.client.protocolCommands).filter((command) => command.startsWith("streamsignaling"))).toEqual([]);
  });

  it("removes the viewer from the stream with removeclientfromstream when it leaves or closes the signal", async () => {
    const gateway = await gateways.start();
    const { source, viewer, other } = await nativeShare(gateway);
    await join(viewer);
    await join(other);
    await share(viewer, "screenShareLeave", { streamId: STREAM_ID });
    signalTo(other, `ts-${source.id}`, { kind: "close" });
    await ask(other, "sendTextMessage", { message: "" });
    for (const session of [viewer, other]) {
      expect(session.client.protocolCommands).toContain(`removeclientfromstream id=${STREAM_ID} clid=${session.id}`);
    }
  });

  it("turns what the source sends into signals for the viewer that joined", async () => {
    const gateway = await gateways.start();
    const { viewer, other, sessions } = await nativeShare(gateway);
    await join(viewer);
    const mark = await markOf(viewer);
    const otherMark = await markOf(other);
    const cases: [string, Record<string, string>][] = [
      ["notifyrespondjoinstreamrequest", { id: STREAM_ID, offer: "v=0 first" }],
      ["notifystreamsignaling", { id: STREAM_ID, json: JSON.stringify({ cmd: "joinResponse", args: { decision: 1, offer: "v=0 joined" } }) }],
      ["notifystreamsignaling", { id: STREAM_ID, json: JSON.stringify({ cmd: "joinResponse", args: { decision: "0" } }) }],
      ["notifystreamsignaling", { id: STREAM_ID, json: JSON.stringify({ cmd: "reconnectOffer", args: { sdp: "v=0 again" } }) }],
      ["notifystreamsignaling", { id: STREAM_ID, json: JSON.stringify({ cmd: "answer", args: { answer: "v=0 answer" } }) }],
      ["notifystreamsignaling", { id: STREAM_ID, json: JSON.stringify({ cmd: "iceCandidate", args: { sdp: "candidate:9", mid: "1", mLine: 1 } }) }],
      ["notifystreamsignaling", { id: STREAM_ID, json: JSON.stringify({ cmd: "iceCandidate", args: { candidate: "candidate:10" } }) }],
      // None of these reaches the browser.
      ["notifystreamsignaling", { id: STREAM_ID, json: "{oops" }],
      ["notifystreamsignaling", { id: STREAM_ID, json: JSON.stringify({ cmd: "iceCandidate", args: {} }) }],
      ["notifystreamsignaling", { id: STREAM_ID, json: JSON.stringify({ cmd: "hello", args: {} }) }],
      ["notifystreamsignaling", { id: "another-stream", json: JSON.stringify({ cmd: "answer", args: { answer: "x" } }) }],
      ["notifystreamsignaling", { json: JSON.stringify({ cmd: "answer", args: { answer: "x" } }) }],
    ];
    for (const [name, params] of cases) notify(sessions, name, params);
    const signals = (await received(viewer, mark)).filter((message) => message.type === "screenShareSignal");
    expect(signals.map((message) => message.signal)).toEqual([
      { kind: "offer", sdp: "v=0 first" },
      { kind: "offer", sdp: "v=0 joined" },
      { kind: "close" },
      { kind: "offer", sdp: "v=0 again" },
      { kind: "answer", sdp: "v=0 answer" },
      { kind: "iceCandidate", candidate: "candidate:9", sdpMid: "1", sdpMLineIndex: 1 },
      { kind: "iceCandidate", candidate: "candidate:10" },
    ]);
    expect(signals.every((message) => message.streamId === STREAM_ID && typeof message.fromPeerId === "string" && message.fromPeerId.startsWith("ts-"))).toBe(true);
    // Only a session that joined gets the source's signals.
    expect((await received(other, otherMark)).filter((message) => message.type === "screenShareSignal")).toEqual([]);
  });
});
