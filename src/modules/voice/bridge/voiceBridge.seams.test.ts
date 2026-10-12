import { generateIdentity } from "@echosixhiya/teamspeak-client";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubLogger } from "../../../../test/support/adminService.js";
import { FakeTeamSpeakServer } from "../../../../test/support/fakeTsClient.js";
import { type Gateway, useGateway } from "../../../../test/support/gateway.js";
import { silentFrame } from "../../../../test/support/audio.js";
import { JoinTicketStore } from "../../join/joinTicket.js";
import { VoiceBridge } from "../voiceBridge.js";
import { ask, joinVoice } from "../../../../test/support/voice.js";
import { WsClient } from "../../../../test/support/wsClient.js";
import { normalizeTeamSpeakKickedReason } from "../../../shared/errors.js";

const gateways = useGateway();
afterEach(() => vi.useRealTimers());

const withIdentity = () => ({ identity: generateIdentity(8).toString(), rememberIdentity: true });

async function sessionNicknames(gateway: Gateway): Promise<string[]> {
  const admin = await gateway.adminLogin();
  const { sessions } = (await (await admin.get("sessions")).json()) as { sessions: { nickname: string }[] };
  return sessions.map((session) => session.nickname);
}

describe("kick and transport drop", () => {
  it("kick first, then the drop that follows it: the reason arrives once, nothing says `disconnected` or reconnects", async () => {
    const gateway = await gateways.start();
    const { socket, client } = await joinVoice(gateway, { nickname: "alice" });
    gateway.ts.kick(client, "bye");
    expect(await socket.waitForClose()).toEqual({ code: 1000, reason: "teamSpeak-kicked" });
    expect(socket.messagesOfType("connectionFailed")).toHaveLength(1);
    expect(socket.messagesOfType("disconnected")).toEqual([]);
    expect(socket.messagesOfType("reconnecting")).toEqual([]);
    expect(await sessionNicknames(gateway)).toEqual([]);
  });

  // disconnected already moved the session to reconnecting when the kick arrives, the kick must still
  // end it instead of reconnecting into the kick.
  it("drop first, then the kick: the browser gets the kick reason and the session does not reconnect", async () => {
    const gateway = await gateways.start();
    const { socket, client } = await joinVoice(gateway, { nickname: "alice" });
    client.emit("disconnected", new Error("read ECONNRESET"));
    client.emit("kicked", normalizeTeamSpeakKickedReason("bye", 4));
    const closed = await socket.waitForClose(500);
    expect(closed).toEqual({ code: 1000, reason: "teamSpeak-kicked" });
    expect(socket.messagesOfType("connectionFailed")).toHaveLength(1);
  });
});

describe("the reconnect window", () => {
  it("is exhausted: `reconnectFailed` with a code, the session is torn down and the identity is free", async () => {
    const gateway = await gateways.start();
    const identity = withIdentity();
    const { socket, client } = await joinVoice(gateway, { nickname: "alice", ...identity });
    gateway.ts.failNext("connect", new Error("read ECONNRESET"));
    gateway.ts.drop(client, new Error("read ECONNRESET"));
    await socket.waitForMessage("reconnecting");
    // The window opened with the first attempt; the next failure finds it 6 minutes old.
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => realNow + 6 * 60_000);
    const failed = await socket.waitForMessage("reconnectFailed", { timeoutMs: 5000 });
    expect(typeof failed.code).toBe("string");
    expect(await socket.waitForClose()).toMatchObject({ code: 1000, reason: "teamSpeak-connect-failed" });
    vi.restoreAllMocks();
    expect(await sessionNicknames(gateway)).toEqual([]);
    expect((await joinVoice(gateway, { nickname: "again", ...identity })).client.isConnected()).toBe(true);
  });
});

describe("the heartbeat", () => {
  /** Resolves when the browser side has received a ping, which `ws` answers with a pong at once. */
  const nextPing = (socket: WsClient) =>
    new Promise<void>((resolve) => {
      (socket as unknown as { socket: { once(event: string, listener: () => void): void } }).socket.once("ping", resolve);
    });

  it("terminates a session whose peer never answers a ping, and frees its identity", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const gateway = await gateways.start();
    const identity = withIdentity();
    const { socket, client } = await joinVoice(gateway, { nickname: "dead", ...identity });
    socket.pauseReading();
    vi.advanceTimersByTime(30_000);
    vi.advanceTimersByTime(30_000);
    vi.useRealTimers();
    await vi.waitFor(async () => {
      expect(await sessionNicknames(gateway)).toEqual([]);
      expect(client.isConnected()).toBe(false);
    });
    socket.resumeReading();
    expect((await joinVoice(gateway, { nickname: "again", ...identity })).client.isConnected()).toBe(true);
  });

  it("keeps a session whose peer answers", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alive" });
    for (let round = 0; round < 3; round++) {
      const pinged = nextPing(alice.socket);
      vi.advanceTimersByTime(30_000);
      await pinged;
      // The pong was sent before this message, on the same connection, so it is handled first.
      await ask(alice, "sendTextMessage", { message: "" });
    }
    vi.useRealTimers();
    expect(alice.socket.closeInfo).toBeNull();
    expect(await sessionNicknames(gateway)).toEqual(["alive"]);
  });
});

describe("avatars", () => {
  it("asks for each member once: a failure is remembered, and a member who enters later is the only new request", async () => {
    const gateway = await gateways.start();
    const step = vi.spyOn(gateway.ts, "step");
    const avatarRequests = () => step.mock.calls.filter(([operation]) => operation === "avatar").length;
    gateway.ts.addMember("bob");
    gateway.ts.addMember("carol");
    gateway.ts.failNext("avatar", new Error("no file transfer"));
    const alice = await joinVoice(gateway, { nickname: "alice" });
    // The session itself, bob and carol: one request each, one of them refused.
    await vi.waitFor(() => expect(avatarRequests()).toBe(3));
    gateway.ts.addMember("dave");
    await vi.waitFor(() => expect(avatarRequests()).toBe(4));
    await ask(alice, "sendTextMessage", { message: "" });
    expect(avatarRequests()).toBe(4);
  });
});

describe("ending several sessions at once", () => {
  it("terminateSession of a sharer tells the viewer the share ended and leaves the others connected", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    const viewer = await joinVoice(gateway, { nickname: "viewer" });
    const other = await joinVoice(gateway, { nickname: "other", channel: "Room B" });
    const requestId = "share-1";
    const after = owner.socket.mark();
    owner.socket.send({ type: "screenShareStart", requestId } as never);
    await owner.socket.waitForMessage((message) => message.requestId === requestId, { after });
    const mark = viewer.socket.mark();
    const admin = await gateway.adminLogin();
    const { sessions } = (await (await admin.get("sessions")).json()) as { sessions: { id: string; nickname: string }[] };
    await admin.post(`sessions/${sessions.find((session) => session.nickname === "owner")!.id}/terminate`);
    await owner.socket.waitForClose();
    await viewer.socket.waitForMessage("screenShareStopped", { after: mark });
    expect(viewer.socket.closeInfo).toBeNull();
    expect(other.socket.closeInfo).toBeNull();
    expect((await sessionNicknames(gateway)).sort()).toEqual(["other", "viewer"]);
  });

  it("stop() closes every session with 1001 and disconnects every TeamSpeak client, shares included", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    const viewer = await joinVoice(gateway, { nickname: "viewer" });
    const other = await joinVoice(gateway, { nickname: "other", channel: "Room B" });
    const after = owner.socket.mark();
    owner.socket.send({ type: "screenShareStart", requestId: "share-1" } as never);
    await owner.socket.waitForMessage((message) => message.requestId === "share-1", { after });
    await gateway.stop();
    const closes = await Promise.all([owner, viewer, other].map((session) => session.socket.waitForClose()));
    expect(closes.map((closed) => closed.code)).toEqual([1001, 1001, 1001]);
    expect([owner, viewer, other].map((session) => session.client.isConnected())).toEqual([false, false, false]);
  });
});

describe("an unavailable Opus encoder", () => {
  it("answers AUDIO_ENCODER_UNAVAILABLE once per 5 s window, counts the frames and sends nothing to TeamSpeak", async () => {
    const ts = new FakeTeamSpeakServer();
    const joinTickets = new JoinTicketStore();
    const bridge = new VoiceBridge({ joinTickets, createClient: ts.createClient }, stubLogger());
    const server = createServer();
    bridge.attach(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const ticket = joinTickets.create({ target: { host: "ts.test", port: 9987 }, serverPassword: "", nickname: "alice" });
      const socket = await WsClient.open(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws/voice?ticket=${ticket}`);
      await socket.waitForMessage("channelList");
      for (const entry of (bridge as unknown as { entries: Map<string, { opusEncoder: unknown }> }).entries.values())
        entry.opusEncoder = null;
      const frames = () => {
        for (let i = 0; i < 3; i++) socket.sendRaw(silentFrame());
      };
      const settle = async () => {
        const id = `s-${Math.random()}`;
        const after = socket.mark();
        socket.send({ type: "sendTextMessage", requestId: id, payload: { message: "" } });
        await socket.waitForMessage((m) => m.requestId === id, { after });
      };
      frames();
      await settle();
      expect(socket.messagesOfType("audioError")).toEqual([
        { type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "Opus encoder unavailable" },
      ]);
      const realNow = Date.now();
      vi.spyOn(Date, "now").mockImplementation(() => realNow + 6_000);
      frames();
      await settle();
      expect(socket.messagesOfType("audioError")).toHaveLength(2);
      expect(ts.created[0]!.sentVoice).toEqual([]);
      expect(bridge.getSessionSummaries()[0]!.audio).toMatchObject({ ingressFrames: 6, tsSendFrames: 0 });
      socket.close();
      await socket.waitForClose();
    } finally {
      vi.restoreAllMocks();
      await bridge.shutdown();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("the TeamSpeak listener order", () => {
  it("attaches every listener, in the register* order, before connect() is called", async () => {
    const ts = new FakeTeamSpeakServer();
    const calls: string[] = [];
    const createClient: typeof ts.createClient = (...args) => {
      const client = ts.createClient(...args);
      const on = client.on.bind(client) as (event: string, listener: never) => unknown;
      const connect = client.connect.bind(client);
      (client as unknown as { on: unknown }).on = (event: string, listener: never) => {
        calls.push(`on:${event}`);
        return on(event, listener);
      };
      (client as unknown as { connect: unknown }).connect = () => {
        calls.push("connect");
        return connect();
      };
      return client;
    };
    const joinTickets = new JoinTicketStore();
    const bridge = new VoiceBridge({ joinTickets, createClient }, stubLogger());
    const server = createServer();
    bridge.attach(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const ticket = joinTickets.create({ target: { host: "ts.test", port: 9987 }, serverPassword: "", nickname: "alice" });
      const socket = await WsClient.open(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws/voice?ticket=${ticket}`);
      await socket.waitForMessage("channelList");
      expect(calls).toEqual([
        // registerVoiceDirectory
        "on:directorySnapshot",
        "on:clientEnter",
        "on:clientLeave",
        "on:clientMoved",
        "on:clientUpdated",
        // rawNotification, voiceData (inline in VoiceBridge.attach)
        "on:rawNotification",
        "on:voiceData",
        // registerVoiceChat
        "on:textMessage",
        "on:poked",
        // registerVoiceConnection
        "on:kicked",
        "on:disconnected",
        "connect",
      ]);
      socket.close();
      await socket.waitForClose();
    } finally {
      await bridge.shutdown();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
