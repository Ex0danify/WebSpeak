import { describe, expect, it } from "vitest";
import { type Gateway, useGateway } from "../../../../test/helpers/gateway.js";
import { ask, joinVoice, type VoiceSession } from "../../../../test/helpers/voice.js";
import type { JsonMessage } from "../../../../test/helpers/wsClient.js";

const gateways = useGateway();

interface Stream { streamId: string; ownerPeerId: string; [key: string]: unknown }

/** A sharer, a viewer and a bystander in the same channel, and one person in another channel. */
async function room(gateway: Gateway) {
  const owner = await joinVoice(gateway, { nickname: "owner" });
  const viewer = await joinVoice(gateway, { nickname: "viewer" });
  const bystander = await joinVoice(gateway, { nickname: "bystander" });
  const away = await joinVoice(gateway, { nickname: "away", channel: "Room B" });
  return { owner, viewer, bystander, away };
}

/** Sends a screen share command and returns the first message that carries its request id. */
async function share(session: VoiceSession, type: string, payload: Record<string, unknown> = {}): Promise<JsonMessage> {
  const requestId = `q-${Math.random().toString(36).slice(2)}`;
  const after = session.socket.mark();
  session.socket.send({ type, requestId, ...payload } as never);
  return session.socket.waitForMessage((message) => message.requestId === requestId, { after });
}

async function startShare(owner: VoiceSession, payload: Record<string, unknown> = {}): Promise<Stream> {
  const started = await share(owner, "screenShareStart", payload);
  expect(started.type).toBe("screenShareStarted");
  return started.stream as Stream;
}

/** The screen share messages a session has received since `after`, by type and stream. Waits until the gateway has answered a no-op, so a message that was sent is in the list. */
async function received(session: VoiceSession, after: number): Promise<JsonMessage[]> {
  await ask(session, "sendTextMessage", { message: "" });
  return session.socket.messages.slice(after).filter((message) => message.type.startsWith("screenShare"));
}
/** A mark that is after everything the gateway has already sent to this session, not just after what has arrived yet. */
async function markOf(session: VoiceSession): Promise<number> {
  await ask(session, "sendTextMessage", { message: "" });
  return session.socket.mark();
}
const marksOf = (...sessions: VoiceSession[]) => Promise.all(sessions.map(markOf));
const typesOf = (messages: JsonMessage[]) => messages.map((message) => message.type);

describe("the ICE servers in `connected`", () => {
  it("are TeamSpeak's public STUN servers when none are configured", async () => {
    const gateway = await gateways.start();
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    expect((await socket.waitForMessage("connected")).screenShareIceServers).toEqual([{ urls: "stun:turn.teamspeak.com:3478" }, { urls: "stun:turn2.teamspeak.com:3478" }]);
  });

  it("are the configured ones, cleaned up, read again for every join", async () => {
    let configured: unknown[] = [{ urls: ["turn:t.test", "http://bad.test"], username: "user", credential: "secret" }, { urls: "http://only-bad.test" }];
    const gateway = await gateways.start({ voiceBridgeOptions: { screenShareIceServers: () => configured as never } });
    const first = await gateway.openVoice(gateway.ticket({ nickname: "first" }));
    expect((await first.waitForMessage("connected")).screenShareIceServers).toEqual([{ urls: "turn:t.test", username: "user", credential: "secret" }]);
    configured = [{ urls: "stun:other.test" }];
    const second = await gateway.openVoice(gateway.ticket({ nickname: "second" }));
    expect((await second.waitForMessage("connected")).screenShareIceServers).toEqual([{ urls: "stun:other.test" }]);
  });
});

describe("starting a share", () => {
  it("answers the sharer with the stream and tells the rest of the channel, and nobody in another channel", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, away } = await room(gateway);
    const marks = await marksOf(viewer, away);
    const started = await share(owner, "screenShareStart", { name: "  Slides  ", audio: true });
    expect(started).toMatchObject({
      type: "screenShareStarted",
      owner: true,
      stream: { source: "browser", ownerPeerId: expect.stringMatching(/^w-/), ownerClientId: owner.id, ownerNickname: "owner", name: "Slides", audio: true, viewerCount: 0, viewers: [], streamId: expect.stringMatching(/^screen-/) },
    });
    const [seen, missed] = await Promise.all([received(viewer, marks[0]!), received(away, marks[1]!)]);
    expect(seen).toEqual([{ type: "screenShareStarted", owner: false, stream: (started.stream as Stream) }]);
    expect(missed).toEqual([]);
  });

  it("names a share after its owner when it has no name, and shares no audio unless asked", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    expect(await startShare(owner)).toMatchObject({ name: "owner 的屏幕", audio: false });
  });

  it("allows one share per session", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    await startShare(owner);
    expect(await share(owner, "screenShareStart")).toMatchObject({ type: "screenShareError", code: "SCREEN_SHARE_ALREADY_ACTIVE" });
  });

  it("lists the shares of the session's own channel, and an invalid request answers a protocol error", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, away } = await room(gateway);
    const stream = await startShare(owner);
    for (const [session, expected] of [[owner, [stream]], [viewer, [stream]], [away, []]] as const) {
      const after = session.socket.mark();
      session.socket.send({ type: "screenShareList" });
      expect((await session.socket.waitForMessage("screenShareList", { after })).streams).toEqual(expected);
    }
    const after = viewer.socket.mark();
    viewer.socket.send({ type: "screenShareStop", streamId: "" });
    expect(await viewer.socket.waitForMessage("error", { after })).toMatchObject({ error: { code: "INVALID_SCREEN_SHARE_STREAM", recoverable: false } });
  });
});

describe("watching a share", () => {
  it("adds the viewer to the stream, tells the sharer, and tells the channel the new count", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, bystander, away } = await room(gateway);
    const stream = await startShare(owner);
    const marks = await marksOf(owner, bystander, away);
    const joined = await share(viewer, "screenShareJoin", { streamId: stream.streamId });
    expect(joined).toMatchObject({ type: "screenShareJoined", mode: "browser", ownerPeerId: stream.ownerPeerId, stream: { streamId: stream.streamId, viewerCount: 1, viewers: [{ peerId: expect.stringMatching(/^w-/), nickname: "viewer" }] } });
    const [toOwner, toBystander, toAway] = await Promise.all([owner, bystander, away].map((session, i) => received(session, marks[i]!)));
    expect(toOwner).toMatchObject([{ type: "screenShareViewerJoined", streamId: stream.streamId, viewerNickname: "viewer" }, { type: "screenShareViewerCount", viewerCount: 1 }]);
    expect(toBystander).toMatchObject([{ type: "screenShareViewerCount", streamId: stream.streamId, viewerCount: 1, viewers: [{ nickname: "viewer" }] }]);
    expect(toAway).toEqual([]);
  });

  it("answers a second join of the same viewer without telling anyone again", async () => {
    const gateway = await gateways.start();
    const { owner, viewer } = await room(gateway);
    const stream = await startShare(owner);
    await share(viewer, "screenShareJoin", { streamId: stream.streamId });
    const mark = await markOf(owner);
    expect(await share(viewer, "screenShareJoin", { streamId: stream.streamId })).toMatchObject({ type: "screenShareJoined", stream: { viewerCount: 1 } });
    expect(await received(owner, mark)).toEqual([]);
  });

  it("refuses the sharer as a viewer, a stream that does not exist, and a stream in another channel", async () => {
    const gateway = await gateways.start();
    const { owner, away } = await room(gateway);
    const stream = await startShare(owner);
    expect(await share(owner, "screenShareJoin", { streamId: stream.streamId })).toMatchObject({ type: "screenShareError", code: "SCREEN_SHARE_OWNER_CANNOT_JOIN" });
    expect(await share(away, "screenShareJoin", { streamId: "screen-nope" })).toMatchObject({ type: "screenShareError", code: "SCREEN_SHARE_NOT_FOUND" });
    expect(await share(away, "screenShareJoin", { streamId: stream.streamId })).toMatchObject({ type: "screenShareError", code: "SCREEN_SHARE_TARGET_MISMATCH" });
  });

  it("lets a viewer leave: the viewer, the sharer and the channel are told, and the count goes down", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, bystander } = await room(gateway);
    const stream = await startShare(owner);
    await share(viewer, "screenShareJoin", { streamId: stream.streamId });
    const marks = await marksOf(owner, bystander);
    const viewerMark = await markOf(viewer);
    expect(await share(viewer, "screenShareLeave", { streamId: stream.streamId })).toMatchObject({ type: "screenShareCompleted" });
    expect(typesOf(await received(viewer, viewerMark))).toEqual(["screenShareLeft", "screenShareViewerCount", "screenShareCompleted"]);
    expect(await received(owner, marks[0]!)).toMatchObject([{ type: "screenShareViewerLeft", streamId: stream.streamId }, { type: "screenShareViewerCount", viewerCount: 0, viewers: [] }]);
    expect(await received(bystander, marks[1]!)).toMatchObject([{ type: "screenShareViewerCount", viewerCount: 0 }]);
  });
});

describe("signals between the sharer and a viewer", () => {
  const offer = { kind: "offer", sdp: "v=0" };

  it("go from the sharer to a viewer and back, with the sender's peer id and the signal untouched", async () => {
    const gateway = await gateways.start();
    const { owner, viewer } = await room(gateway);
    const stream = await startShare(owner);
    const { viewerPeerId } = await (async () => {
      const mark = owner.socket.mark();
      await share(viewer, "screenShareJoin", { streamId: stream.streamId });
      return owner.socket.waitForMessage("screenShareViewerJoined", { after: mark }) as Promise<{ viewerPeerId: string }>;
    })();
    const toViewer = viewer.socket.mark();
    owner.socket.send({ type: "screenShareSignal", streamId: stream.streamId, targetPeerId: viewerPeerId, signal: offer } as never);
    expect(await viewer.socket.waitForMessage("screenShareSignal", { after: toViewer })).toEqual({ type: "screenShareSignal", streamId: stream.streamId, fromPeerId: stream.ownerPeerId, signal: offer });
    const toOwner = owner.socket.mark();
    const candidate = { kind: "iceCandidate", candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 };
    viewer.socket.send({ type: "screenShareSignal", streamId: stream.streamId, targetPeerId: stream.ownerPeerId, signal: { kind: "answer", sdp: "v=0 answer" } } as never);
    viewer.socket.send({ type: "screenShareSignal", streamId: stream.streamId, targetPeerId: stream.ownerPeerId, signal: candidate } as never);
    await owner.socket.waitForMessage((message) => message.type === "screenShareSignal" && (message.signal as { kind: string }).kind === "iceCandidate", { after: toOwner });
    expect((await received(owner, toOwner)).map((message) => [message.fromPeerId, (message.signal as { kind: string }).kind])).toEqual([[viewerPeerId, "answer"], [viewerPeerId, "iceCandidate"]]);
  });

  it("do not go between two viewers, to a peer that is not there, or from someone who is not part of the share", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, bystander } = await room(gateway);
    const stream = await startShare(owner);
    const second = await joinVoice(gateway, { nickname: "second" });
    const peerIds: Record<string, string> = {};
    for (const session of [viewer, second]) {
      const mark = owner.socket.mark();
      await share(session, "screenShareJoin", { streamId: stream.streamId });
      peerIds[session === viewer ? "viewer" : "second"] = ((await owner.socket.waitForMessage("screenShareViewerJoined", { after: mark })) as { viewerPeerId: string }).viewerPeerId;
    }
    const signal = (session: VoiceSession, targetPeerId: string) => {
      const after = session.socket.mark();
      session.socket.send({ type: "screenShareSignal", streamId: stream.streamId, targetPeerId, signal: offer } as never);
      return session.socket.waitForMessage((message) => message.type === "screenShareError", { after });
    };
    const secondMark = await markOf(second);
    expect(await signal(viewer, peerIds.second!)).toMatchObject({ code: "SCREEN_SHARE_PEER_NOT_FOUND" });
    expect(await signal(viewer, peerIds.viewer!)).toMatchObject({ code: "SCREEN_SHARE_PEER_NOT_FOUND" });
    expect(await signal(owner, "w-nobody")).toMatchObject({ code: "SCREEN_SHARE_PEER_NOT_FOUND" });
    expect(await signal(owner, stream.ownerPeerId)).toMatchObject({ code: "SCREEN_SHARE_PEER_NOT_FOUND" });
    expect(await signal(bystander, stream.ownerPeerId)).toMatchObject({ code: "SCREEN_SHARE_SIGNAL_FORBIDDEN" });
    expect(await received(second, secondMark)).toEqual([]);
  });
});

describe("ending a share", () => {
  it("is done by the sharer: everyone in the channel is told, the share is gone from the list and can no longer be joined", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, bystander, away } = await room(gateway);
    const stream = await startShare(owner);
    await share(viewer, "screenShareJoin", { streamId: stream.streamId });
    const marks = await marksOf(viewer, bystander, away);
    expect(await share(owner, "screenShareStop", { streamId: stream.streamId })).toEqual({ type: "screenShareCompleted", requestId: expect.any(String) });
    const [toViewer, toBystander, toAway] = await Promise.all([viewer, bystander, away].map((session, i) => received(session, marks[i]!)));
    expect(toViewer).toEqual([{ type: "screenShareStopped", streamId: stream.streamId, reason: "owner-stopped" }]);
    expect(toBystander).toEqual(toViewer);
    expect(toAway).toEqual([]);
    expect(await share(bystander, "screenShareJoin", { streamId: stream.streamId })).toMatchObject({ code: "SCREEN_SHARE_NOT_FOUND" });
    const after = viewer.socket.mark();
    viewer.socket.send({ type: "screenShareList" });
    expect((await viewer.socket.waitForMessage("screenShareList", { after })).streams).toEqual([]);
    expect(await share(owner, "screenShareStart")).toMatchObject({ type: "screenShareStarted" });
  });

  it("is refused for anyone else, and the share goes on", async () => {
    const gateway = await gateways.start();
    const { owner, viewer } = await room(gateway);
    const stream = await startShare(owner);
    await share(viewer, "screenShareJoin", { streamId: stream.streamId });
    expect(await share(viewer, "screenShareStop", { streamId: stream.streamId })).toMatchObject({ type: "screenShareError", code: "SCREEN_SHARE_NOT_OWNER" });
    expect(await share(viewer, "screenShareJoin", { streamId: stream.streamId })).toMatchObject({ type: "screenShareJoined", stream: { viewerCount: 1 } });
  });

  it("happens when the sharer disconnects", async () => {
    const gateway = await gateways.start();
    const { owner, viewer } = await room(gateway);
    await startShare(owner);
    const mark = await markOf(viewer);
    owner.socket.close();
    expect(await viewer.socket.waitForMessage("screenShareStopped", { after: mark })).toMatchObject({ reason: "owner-disconnected" });
  });

  it("happens when the sharer changes channel", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    const viewer = await joinVoice(gateway, { nickname: "viewer" });
    const stream = await startShare(owner);
    await share(viewer, "screenShareJoin", { streamId: stream.streamId });
    const mark = await markOf(viewer);
    await ask(owner, "switchChannel", { channelId: "3" });
    expect(await viewer.socket.waitForMessage((message) => message.type === "screenShareStopped", { after: mark })).toMatchObject({ streamId: stream.streamId, reason: "owner-moved-channel" });
  });

  it("does not need the viewer: a viewer who disconnects is dropped from the count", async () => {
    const gateway = await gateways.start();
    const { owner, viewer } = await room(gateway);
    const stream = await startShare(owner);
    await share(viewer, "screenShareJoin", { streamId: stream.streamId });
    const mark = await markOf(owner);
    viewer.socket.close();
    expect(await owner.socket.waitForMessage("screenShareViewerLeft", { after: mark })).toMatchObject({ streamId: stream.streamId });
    expect(await owner.socket.waitForMessage("screenShareViewerCount", { after: mark })).toMatchObject({ viewerCount: 0 });
  });
});

// F18: every session sees every move on the server, and `reconcileScreenShareAfterClientMove` used to compare
// the destination of whoever moved with the channel of the share, without checking that the mover is the
// sharer or the viewer. The tests below move somebody else.
describe("someone else changing channel", () => {
  async function shareWithViewer(gateway: Gateway) {
    const { owner, viewer, bystander } = await room(gateway);
    const stream = await startShare(owner);
    await share(viewer, "screenShareJoin", { streamId: stream.streamId });
    return { owner, viewer, bystander, stream };
  }
  const listed = async (session: VoiceSession) => {
    const after = await markOf(session);
    session.socket.send({ type: "screenShareList" });
    return ((await session.socket.waitForMessage("screenShareList", { after })).streams as Stream[]).map((stream) => stream.streamId);
  };

  it("F18: leaves the share of a sharer who stayed put running, with its viewer", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, bystander, stream } = await shareWithViewer(gateway);
    await ask(bystander, "switchChannel", { channelId: "3" });
    expect(await listed(owner)).toEqual([stream.streamId]);
    const mark = await markOf(owner);
    expect(await received(owner, mark)).toEqual([]);
    expect(await listed(viewer)).toEqual([stream.streamId]);
  });

  it("F18: a viewer who changes channel leaves the share, and the share keeps running for the sharer", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, stream } = await shareWithViewer(gateway);
    const mark = await markOf(owner);
    await ask(viewer, "switchChannel", { channelId: "3" });
    const told = typesOf(await received(owner, mark));
    expect(told).toContain("screenShareViewerLeft");
    expect(told).not.toContain("screenShareStopped");
    expect(await listed(owner)).toEqual([stream.streamId]);
  });
});
