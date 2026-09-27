import { describe, expect, it, vi } from "vitest";
import { type Gateway, useGateway } from "../../test/helpers/gateway.js";
import { ask, joinVoice, type VoiceSession } from "../../test/helpers/voice.js";
import type { JsonMessage } from "../../test/helpers/ws-client.js";

const gateways = useGateway();

const TS_STREAM = "ts-9";
const NATIVE_VIEWER = 77;
const NATIVE_PEER = `ts-viewer-${NATIVE_VIEWER}`;

function notify(sessions: VoiceSession[], name: string, params: Record<string, string>): void {
  for (const session of sessions) session.client.emit("rawNotification", { name, params });
}

/** Marks the socket after everything the gateway has already sent it. */
async function markOf(session: VoiceSession): Promise<number> {
  await ask(session, "sendTextMessage", { message: "" });
  return session.socket.mark();
}

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

const commandsOf = (session: VoiceSession, name: string) => session.client.protocolCommands.filter((command) => command.startsWith(`${name} `));

/**
 * A browser share by `owner`, watched by `viewer`, that TeamSpeak has announced as stream `ts-9` to the
 * owner's session only. With every session told, see F18's neighbour F19 below.
 */
async function publishedShare(gateway: Gateway, payload: Record<string, unknown> = {}) {
  const owner = await joinVoice(gateway, { nickname: "owner" });
  const viewer = await joinVoice(gateway, { nickname: "viewer" });
  const sessions = [owner, viewer];
  const started = await share(owner, "screenShareStart", payload);
  const stream = started.stream as { streamId: string };
  await share(viewer, "screenShareJoin", { streamId: stream.streamId });
  notify([owner], "notifystreamstarted", { id: TS_STREAM, clid: String(owner.id) });
  return { owner, viewer, sessions, streamId: stream.streamId };
}

const signal = (session: VoiceSession, streamId: string, targetPeerId: string, body: Record<string, unknown>) => {
  const after = session.socket.mark();
  session.socket.send({ type: "screenShareSignal", streamId, targetPeerId, signal: body } as never);
  return after;
};

describe("a browser share published to TeamSpeak", () => {
  it("asks TeamSpeak for a stream with the share's name and audio setting, escaped", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    await share(owner, "screenShareStart", { name: "Team demo | 2/3", audio: true });
    expect(commandsOf(owner, "setupstream")).toEqual(["setupstream name=Team\\sdemo\\s\\p\\s2\\/3 type=3 bitrate=4608 accessibility=1 mode=1 viewer_limit=0 audio=1"]);
    const quiet = await joinVoice(gateway, { nickname: "quiet" });
    await share(quiet, "screenShareStart");
    expect(commandsOf(quiet, "setupstream")[0]).toMatch(/ audio=0$/);
  });

  it("goes on when TeamSpeak refuses the stream: the browser share is still there", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    gateway.ts.onProtocolCommand = (command) => { if (command.startsWith("setupstream")) throw new Error("no permission"); };
    const started = await share(owner, "screenShareStart");
    expect(started.type).toBe("screenShareStarted");
    const mark = await markOf(owner);
    owner.socket.send({ type: "screenShareList" });
    expect((await owner.socket.waitForMessage("screenShareList", { after: mark })).streams).toMatchObject([{ source: "browser" }]);
    expect(gateway.logger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: "no permission" }), "Could not publish browser screen share to TeamSpeak");
  });

  it("pairs with the stream TeamSpeak announces for the sharer, without a second card", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, streamId } = await publishedShare(gateway);
    const mark = await markOf(viewer);
    expect(await received(viewer, 0)).not.toContainEqual(expect.objectContaining({ type: "screenShareStarted", stream: expect.objectContaining({ source: "teamspeak" }) }));
    viewer.socket.send({ type: "screenShareList" });
    expect((await viewer.socket.waitForMessage("screenShareList", { after: mark })).streams).toMatchObject([{ streamId, source: "browser" }]);
    // The pairing is what lets the stop reach TeamSpeak.
    await share(owner, "screenShareStop", { streamId });
    expect(commandsOf(owner, "stopstream")).toEqual([`stopstream id=${TS_STREAM} reason=1`]);
  });

  it("sends no stopstream for a share that TeamSpeak never announced", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    const { stream } = (await share(owner, "screenShareStart")) as unknown as { stream: { streamId: string } };
    await share(owner, "screenShareStop", { streamId: stream.streamId });
    expect(commandsOf(owner, "stopstream")).toEqual([]);
  });
});

// F19: every gateway session on a target sees the same notification. The first session pairs the stream with
// the browser share; the next one finds the share already paired, takes the notification for a native
// stream and announces the same share a second time, as a TeamSpeak stream owned by its own sharer.
describe("a published share that every session is told about", () => {
  async function toldToEveryone(gateway: Gateway) {
    const context = await publishedShare(gateway);
    const mark = await markOf(context.viewer);
    notify(context.sessions, "notifystreamstarted", { id: TS_STREAM, clid: String(context.owner.id) });
    const cards = (await received(context.viewer, mark)).filter((message) => message.type === "screenShareStarted");
    return { ...context, cards };
  }

  it("F19: is announced a second time as a TeamSpeak stream of the sharer, and listed twice", async () => {
    const gateway = await gateways.start();
    const { viewer, owner, streamId, cards } = await toldToEveryone(gateway);
    expect(cards).toMatchObject([{ owner: false, stream: { streamId: TS_STREAM, source: "teamspeak", ownerPeerId: `ts-${owner.id}` } }]);
    const mark = await markOf(viewer);
    viewer.socket.send({ type: "screenShareList" });
    const streams = (await viewer.socket.waitForMessage("screenShareList", { after: mark })).streams as { streamId: string }[];
    expect(streams.map((stream) => stream.streamId).sort()).toEqual([streamId, TS_STREAM].sort());
  });

  it.fails("F19: is announced once, as the browser share", async () => {
    const gateway = await gateways.start();
    const { cards } = await toldToEveryone(gateway);
    expect(cards).toEqual([]);
  });
});

describe("TeamSpeak clients watching a browser share", () => {
  it("are announced to the sharer with their own peer id, and counted for everybody in the channel", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, streamId } = await publishedShare(gateway);
    const marks = [await markOf(owner), await markOf(viewer)];
    notify([owner], "notifyjoinstreamrequest", { id: TS_STREAM, clid: String(NATIVE_VIEWER) });
    expect(await received(owner, marks[0]!)).toMatchObject([
      { type: "screenShareNativeViewerJoined", streamId, viewerPeerId: NATIVE_PEER, viewerClientId: NATIVE_VIEWER },
      { type: "screenShareViewerCount", streamId, viewerCount: 2, viewers: [{ nickname: "viewer" }] },
    ]);
    expect(await received(viewer, marks[1]!)).toMatchObject([{ type: "screenShareViewerCount", viewerCount: 2 }]);
  });

  it("ignore a request for a stream the session does not publish, or without a client id", async () => {
    const gateway = await gateways.start();
    const { owner, viewer } = await publishedShare(gateway);
    const mark = await markOf(owner);
    notify([owner], "notifyjoinstreamrequest", { id: "another", clid: String(NATIVE_VIEWER) });
    notify([owner], "notifyjoinstreamrequest", { id: TS_STREAM });
    notify([viewer], "notifyjoinstreamrequest", { id: TS_STREAM, clid: String(NATIVE_VIEWER) });
    expect(await received(owner, mark)).toEqual([]);
  });

  it("get the sharer's offer as respondjoinstreamrequest and its ICE candidates as streamsignaling, and nothing else", async () => {
    const gateway = await gateways.start();
    const { owner, streamId } = await publishedShare(gateway);
    notify([owner], "notifyjoinstreamrequest", { id: TS_STREAM, clid: String(NATIVE_VIEWER) });
    const errors = async (after: number, count: number) => (await received(owner, after)).filter((message) => message.type === "screenShareError").slice(0, count).map((message) => message.code);
    signal(owner, streamId, NATIVE_PEER, { kind: "offer", sdp: "v=0" });
    signal(owner, streamId, NATIVE_PEER, { kind: "iceCandidate", candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 });
    await ask(owner, "sendTextMessage", { message: "" });
    expect(commandsOf(owner, "respondjoinstreamrequest")).toEqual([`respondjoinstreamrequest id=${TS_STREAM} clid=${NATIVE_VIEWER} msg= offer=v=0 decision=1`]);
    expect(commandsOf(owner, "streamsignaling")).toEqual([`streamsignaling id=${TS_STREAM} clid=${NATIVE_VIEWER} json={"cmd":"iceCandidate","args":{"sdp":"candidate:1","mid":"0","mLine":0}}`]);
    const mark = owner.socket.mark();
    signal(owner, streamId, NATIVE_PEER, { kind: "answer", sdp: "v=0" });
    signal(owner, streamId, "ts-viewer-88", { kind: "offer", sdp: "v=0" });
    signal(owner, streamId, "ts-viewer-x", { kind: "offer", sdp: "v=0" });
    expect(await errors(mark, 3)).toEqual(["SCREEN_SHARE_INVALID_SIGNAL", "SCREEN_SHARE_PEER_NOT_FOUND", "SCREEN_SHARE_PEER_NOT_FOUND"]);
    expect(commandsOf(owner, "respondjoinstreamrequest")).toHaveLength(1);
  });

  it("send what they signal to the sharer as signals from their peer id, and only when they have joined", async () => {
    const gateway = await gateways.start();
    const { owner, streamId } = await publishedShare(gateway);
    notify([owner], "notifyjoinstreamrequest", { id: TS_STREAM, clid: String(NATIVE_VIEWER) });
    const mark = await markOf(owner);
    const json = (payload: unknown) => JSON.stringify(payload);
    notify([owner], "notifystreamsignaling", { id: TS_STREAM, clid: String(NATIVE_VIEWER), json: json({ cmd: "answer", args: { answer: "v=0 answer" } }) });
    notify([owner], "notifystreamsignaling", { id: TS_STREAM, clid: String(NATIVE_VIEWER), json: json({ cmd: "iceCandidate", args: { sdp: "candidate:5", mid: "0", mLine: 0 } }) });
    notify([owner], "notifystreamsignaling", { id: TS_STREAM, clid: "88", json: json({ cmd: "answer", args: { answer: "stranger" } }) });
    notify([owner], "notifystreamsignaling", { id: TS_STREAM, clid: String(NATIVE_VIEWER), json: "{oops" });
    expect((await received(owner, mark)).map((message) => [message.type, message.streamId, message.fromPeerId, message.signal])).toEqual([
      ["screenShareSignal", streamId, NATIVE_PEER, { kind: "answer", sdp: "v=0 answer" }],
      ["screenShareSignal", streamId, NATIVE_PEER, { kind: "iceCandidate", candidate: "candidate:5", sdpMid: "0", sdpMLineIndex: 0 }],
    ]);
  });

  it("leave when the sharer closes the signal, or when TeamSpeak says they left: the sharer and the channel are told", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, streamId } = await publishedShare(gateway);
    for (const clid of [NATIVE_VIEWER, 78]) notify([owner], "notifyjoinstreamrequest", { id: TS_STREAM, clid: String(clid) });
    const marks = [await markOf(owner), await markOf(viewer)];
    signal(owner, streamId, NATIVE_PEER, { kind: "close" });
    // A notification is handled at once and a signal arrives over the socket, so wait for the signal first.
    await ask(owner, "sendTextMessage", { message: "" });
    notify([owner], "notifystreamclientleft", { id: TS_STREAM, clid: "78" });
    notify([owner], "notifystreamclientleft", { id: TS_STREAM, clid: "78" });
    const toOwner = await received(owner, marks[0]!);
    expect(commandsOf(owner, "removeclientfromstream")).toEqual([`removeclientfromstream id=${TS_STREAM} clid=${NATIVE_VIEWER}`]);
    expect(toOwner).toMatchObject([
      { type: "screenShareViewerLeft", viewerPeerId: NATIVE_PEER },
      { type: "screenShareViewerCount", viewerCount: 2 },
      { type: "screenShareViewerLeft", viewerPeerId: "ts-viewer-78" },
      { type: "screenShareViewerCount", viewerCount: 1 },
    ]);
    expect((await received(viewer, marks[1]!)).map((message) => message.viewerCount)).toEqual([2, 1]);
  });

  it("are dropped when TeamSpeak ends the stream, the sharer is told, and the browser share carries on", async () => {
    const gateway = await gateways.start();
    const { owner, viewer, streamId } = await publishedShare(gateway);
    notify([owner], "notifyjoinstreamrequest", { id: TS_STREAM, clid: String(NATIVE_VIEWER) });
    const marks = [await markOf(owner), await markOf(viewer)];
    notify([owner, viewer], "notifystreamstopped", { id: TS_STREAM });
    expect(await received(owner, marks[0]!)).toMatchObject([
      { type: "screenShareError", code: "SCREEN_SHARE_NATIVE_PUBLISHER_STOPPED" },
      { type: "screenShareViewerCount", viewerCount: 1 },
    ]);
    expect(await received(viewer, marks[1]!)).toMatchObject([{ type: "screenShareViewerCount", viewerCount: 1 }]);
    // The share is still listed and can still be stopped, without a stopstream for the dead TeamSpeak stream.
    expect(await share(owner, "screenShareStop", { streamId })).toMatchObject({ type: "screenShareCompleted" });
    expect(commandsOf(owner, "stopstream")).toEqual([]);
  });
});

describe("streams that started before the session joined", () => {
  /** The server answers `requeststreaminfo` for its one running stream, like TeamSpeak 6 does. */
  function runningStream(gateway: Gateway, sourceId: () => number) {
    let running = true;
    gateway.ts.onProtocolCommand = (command, client) => {
      const match = /^requeststreaminfo clid=(\d+)$/.exec(command);
      if (running && match && Number(match[1]) === sourceId()) client.emit("rawNotification", { name: "notifystreaminfo", params: { id: "ts-old", clid: match[1]!, name: "Already running", audio: "0" } });
    };
    return { stop: () => { running = false; } };
  }
  const listed = async (session: VoiceSession) => {
    const after = await markOf(session);
    session.socket.send({ type: "screenShareList" });
    return ((await session.socket.waitForMessage("screenShareList", { after })).streams as { streamId: string }[]).map((stream) => stream.streamId);
  };

  it("are found by asking for the stream info of every member, and shown to the new session", async () => {
    const gateway = await gateways.start();
    const source = gateway.ts.addMember("tsuser");
    gateway.ts.addMember("elsewhere", 3n);
    runningStream(gateway, () => source.id);
    const alice = await joinVoice(gateway, { nickname: "alice" });
    const card = await alice.socket.waitForMessage("screenShareStarted");
    expect(card).toMatchObject({ owner: false, stream: { streamId: "ts-old", source: "teamspeak", name: "Already running", ownerClientId: source.id } });
    expect(commandsOf(alice, "requeststreaminfo").sort()).toEqual([`requeststreaminfo clid=${alice.id}`, `requeststreaminfo clid=${source.id}`, `requeststreaminfo clid=${source.id + 1}`].sort());
  });

  it("are asked for once per TeamSpeak target: the next session asks nothing and still lists the stream", async () => {
    const gateway = await gateways.start();
    const source = gateway.ts.addMember("tsuser");
    runningStream(gateway, () => source.id);
    const alice = await joinVoice(gateway, { nickname: "alice" });
    await alice.socket.waitForMessage("screenShareStarted");
    const bob = await joinVoice(gateway, { nickname: "bob" });
    expect(commandsOf(bob, "requeststreaminfo")).toEqual([]);
    expect(await listed(bob)).toEqual(["ts-old"]);
  });

  // F20: a native stream's record lives until a session sees it end. When it ends while no session is
  // connected, nobody does, and discovery ran once for the target, so it is never asked again.
  async function endedWhileNobodyWasThere(gateway: Gateway) {
    const source = gateway.ts.addMember("tsuser");
    const stream = runningStream(gateway, () => source.id);
    const alice = await joinVoice(gateway, { nickname: "alice" });
    await alice.socket.waitForMessage("screenShareStarted");
    alice.socket.close();
    await vi.waitFor(async () => {
      const admin = await gateway.adminLogin();
      expect(((await (await admin.get("sessions")).json()) as { sessions: unknown[] }).sessions).toEqual([]);
    });
    stream.stop();
    const carol = await joinVoice(gateway, { nickname: "carol" });
    return { carol, list: await listed(carol) };
  }

  it("F20: a stream that ended while no session was connected is still listed for the next session, which does not ask again", async () => {
    const gateway = await gateways.start();
    const { carol, list } = await endedWhileNobodyWasThere(gateway);
    expect(list).toEqual(["ts-old"]);
    expect(commandsOf(carol, "requeststreaminfo")).toEqual([]);
  });

  it.fails("F20: a stream that ended while no session was connected is not listed for the next session", async () => {
    const gateway = await gateways.start();
    expect((await endedWhileNobodyWasThere(gateway)).list).toEqual([]);
  });
});
