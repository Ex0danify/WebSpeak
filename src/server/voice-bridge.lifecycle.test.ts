import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateIdentity } from "@echosixhiya/teamspeak-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubLogger } from "../../test/helpers/admin-service.js";
import { FakeTeamSpeakServer } from "../../test/helpers/fake-ts-client.js";
import { type Gateway, useGateway } from "../../test/helpers/gateway.js";
import { joinVoice } from "../../test/helpers/voice.js";
import { WsClient } from "../../test/helpers/ws-client.js";
import { JoinTicketStore, type JoinTicketPayload } from "./join-ticket.js";
import { VoiceBridge } from "./voice-bridge.js";

const gateways = useGateway();

const withIdentity = (identity = generateIdentity(8)) => ({ identity: identity.toString(), rememberIdentity: true });

/** The number of live sessions, read the way the admin console reads it. */
async function activeSessions(gateway: Gateway): Promise<string[]> {
  const admin = await gateway.adminLogin();
  const { sessions } = (await (await admin.get("sessions")).json()) as { sessions: { nickname: string }[] };
  return sessions.map((session) => session.nickname);
}

describe("a session ends and lets go of everything it held", () => {
  it("a browser that closes its socket: the session is gone, TeamSpeak sees the client leave, and its identity is free again", async () => {
    const gateway = await gateways.start();
    const identity = withIdentity();
    const first = await joinVoice(gateway, { nickname: "first", ...identity });
    // While the session lives, the same identity cannot be used a second time.
    const refused = await gateway.openVoice(gateway.ticket({ nickname: "second", ...identity }));
    expect(await refused.waitForClose()).toEqual({ code: 4005, reason: "IDENTITY_IN_USE" });
    expect(await activeSessions(gateway)).toEqual(["first"]);

    first.socket.close();
    await first.socket.waitForClose();
    await expectSessionsGone(gateway, [first.client]);
    const again = await joinVoice(gateway, { nickname: "third", ...identity });
    expect(again.client.isConnected()).toBe(true);
  });

  it("an administrator ends the session: the identity is free again", async () => {
    const gateway = await gateways.start();
    const identity = withIdentity();
    const first = await joinVoice(gateway, { nickname: "first", ...identity });
    const admin = await gateway.adminLogin();
    const { sessions } = (await (await admin.get("sessions")).json()) as { sessions: { id: string }[] };
    await admin.post(`sessions/${sessions[0]!.id}/terminate`);
    await first.socket.waitForClose();
    await expectSessionsGone(gateway, [first.client]);
    expect((await joinVoice(gateway, { nickname: "second", ...identity })).client.isConnected()).toBe(true);
  });

  it("a join that TeamSpeak refuses does not keep the identity: the retry with the right password is accepted", async () => {
    const gateway = await gateways.start({ ts: new FakeTeamSpeakServer({ serverPassword: "sekret" }) });
    const identity = withIdentity();
    const refused = await gateway.openVoice(gateway.ticket({ nickname: "first", serverPassword: "wrong", ...identity }));
    expect(await refused.waitForClose()).toMatchObject({ code: 4003, reason: "INVALID_SERVER_PASSWORD" });
    expect(await activeSessions(gateway)).toEqual([]);
    const retry = await joinVoice(gateway, { nickname: "second", serverPassword: "sekret", ...identity });
    expect(retry.client.isConnected()).toBe(true);
  });

  it("a kick ends the session and frees the identity", async () => {
    const gateway = await gateways.start();
    const identity = withIdentity();
    const first = await joinVoice(gateway, { nickname: "first", ...identity });
    gateway.ts.kick(first.client, "bye");
    await first.socket.waitForClose();
    expect(await activeSessions(gateway)).toEqual([]);
    expect((await joinVoice(gateway, { nickname: "second", ...identity })).client.isConnected()).toBe(true);
  });

  // F37: cleanupEntry() drops the session from the list first and releases the identity lease only
  // after the TeamSpeak client has disconnected, so for as long as that takes, the console lists no
  // session and the identity still cannot be used. The fake's disconnect is held open to show it.
  it.fails("F37: an identity is free as soon as its session has left the admin console's list", async () => {
    const gateway = await gateways.start();
    const identity = withIdentity();
    const first = await joinVoice(gateway, { nickname: "first", ...identity });
    const disconnect = first.client.disconnect.bind(first.client);
    let finishDisconnect!: () => void;
    const held = new Promise<void>((resolve) => { finishDisconnect = resolve; });
    first.client.disconnect = async () => { await held; await disconnect(); };
    try {
      first.socket.close();
      await vi.waitFor(async () => expect(await activeSessions(gateway)).toEqual([]));
      const retry = await gateway.openVoice(gateway.ticket({ nickname: "second", ...identity }));
      await retry.waitForMessage("channelList", { timeoutMs: 1000 });
    } finally {
      finishDisconnect();
    }
  });
});

/** The admin console lists no session and every given fake client has been disconnected. */
async function expectSessionsGone(gateway: Gateway, clients: { isConnected(): boolean }[]): Promise<void> {
  await vi.waitFor(async () => {
    expect(await activeSessions(gateway)).toEqual([]);
    expect(clients.map((client) => client.isConnected())).toEqual(clients.map(() => false));
  });
}

describe("stopping the gateway", () => {
  // F12 keeps stop() from finishing while a session is live, so it is started and not awaited.
  it("F17: closes a live session's socket abnormally (1006, no reason) after disconnecting its TeamSpeak client", async () => {
    const gateway = await gateways.start();
    const session = await joinVoice(gateway, { nickname: "alice" });
    void gateway.stop();
    expect(await session.socket.waitForClose()).toEqual({ code: 1006, reason: "" });
    expect(session.client.isConnected()).toBe(false);
  });

  it.fails("F17: tells the browser the gateway is going away (close code 1001 with a reason)", async () => {
    const gateway = await gateways.start();
    const session = await joinVoice(gateway, { nickname: "alice" });
    void gateway.stop();
    const closed = await session.socket.waitForClose();
    expect(closed.code).toBe(1001);
    expect(closed.reason).not.toBe("");
  });
});

/** A `VoiceBridge` on its own HTTP server, so the tests can look at what it keeps between sessions. */
interface BridgeContext {
  bridge: VoiceBridge;
  ts: FakeTeamSpeakServer;
  joinTickets: JoinTicketStore;
  sockets: WsClient[];
  open(payload: Partial<JoinTicketPayload> & { nickname: string }): Promise<WsClient>;
  /** Everything the bridge holds per session or per socket. */
  held(): { entries: number; leases: number; sockets: number; sessions: number };
}

const bridges: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(bridges.splice(0).map((stop) => stop()));
});

async function startBridge(): Promise<BridgeContext> {
  const ts = new FakeTeamSpeakServer();
  const joinTickets = new JoinTicketStore();
  const bridge = new VoiceBridge({ joinTickets, createClient: ts.createClient }, stubLogger());
  const server: Server = createServer();
  bridge.attach(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const sockets: WsClient[] = [];
  // The maps are private; reading their sizes is the only way to see a leak.
  const internals = bridge as unknown as {
    entries: Map<string, unknown>;
    identityLeases: { owners: Map<string, string> };
    wss: { clients: Set<unknown> };
  };
  bridges.push(async () => {
    sockets.forEach((socket) => socket.close());
    await Promise.all(sockets.map((socket) => socket.waitForClose().catch(() => undefined)));
    // F12: a session the server ended leaves its socket behind, and then shutdown() never finishes.
    void bridge.shutdown();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    bridge,
    ts,
    joinTickets,
    sockets,
    async open(payload) {
      const ticket = joinTickets.create({ target: { host: "ts.test", port: 9987 }, serverPassword: "", ...payload });
      const socket = await WsClient.open(`ws://127.0.0.1:${port}/ws/voice?ticket=${encodeURIComponent(ticket)}`);
      sockets.push(socket);
      return socket;
    },
    held: () => ({ entries: internals.entries.size, leases: internals.identityLeases.owners.size, sockets: internals.wss.clients.size, sessions: bridge.getActiveCount() }),
  };
}

describe("many sessions in a row leave nothing behind", () => {
  const CYCLES = 20;

  it("20 joins that the browser ends: no entry, lease, socket or session is kept, and every TeamSpeak client left", async () => {
    const context = await startBridge();
    for (let i = 0; i < CYCLES; i++) {
      const socket = await context.open({ nickname: `visitor-${i}`, ...(i % 2 ? withIdentity() : {}) });
      await socket.waitForMessage("channelList");
      expect(context.held()).toMatchObject({ entries: 1, sessions: 1 });
      socket.close();
      await socket.waitForClose();
      await waitForHeld(context, { entries: 0, leases: 0, sockets: 0, sessions: 0 });
    }
    expect(context.bridge.getCreatedCount()).toBe(CYCLES);
    expect(context.ts.created).toHaveLength(CYCLES);
    expect(context.ts.created.map((client) => client.isConnected())).toEqual(Array(CYCLES).fill(false));
  });

  it("20 joins that the gateway ends: no entry, lease or session is kept", async () => {
    const context = await startBridge();
    for (let i = 0; i < CYCLES; i++) {
      const socket = await context.open({ nickname: `visitor-${i}`, ...(i % 2 ? withIdentity() : {}) });
      await socket.waitForMessage("channelList");
      const [summary] = context.bridge.getSessionSummaries();
      expect(await context.bridge.terminateSession(summary!.id)).toBe(true);
      await socket.waitForClose();
      await waitForHeld(context, { entries: 0, leases: 0, sessions: 0 });
    }
    expect(context.ts.created.map((client) => client.isConnected())).toEqual(Array(CYCLES).fill(false));
  });

  // F12 effect 2: cleanupEntry() strips the socket's listeners, so `ws` never forgets a socket that
  // the gateway closed itself, and the server keeps all of them for the life of the process.
  it.fails("F12: no closed socket is kept after 20 joins that the gateway ends", async () => {
    const context = await startBridge();
    for (let i = 0; i < CYCLES; i++) {
      const socket = await context.open({ nickname: `visitor-${i}` });
      await socket.waitForMessage("channelList");
      await context.bridge.terminateSession(context.bridge.getSessionSummaries()[0]!.id);
      await socket.waitForClose();
    }
    await waitForHeld(context, { entries: 0, sockets: 0 });
  });
});

async function waitForHeld(context: BridgeContext, expected: Partial<ReturnType<BridgeContext["held"]>>): Promise<void> {
  await vi.waitFor(() => expect(context.held()).toMatchObject(expected), { timeout: 2000 });
}
