import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateIdentity } from "../../../lib/teamspeak/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubLogger } from "../../../../test/support/adminService.js";
import { FakeTeamSpeakServer } from "../../../../test/support/fakeTsClient.js";
import { type Gateway, useGateway } from "../../../../test/support/gateway.js";
import { joinVoice } from "../../../../test/support/voice.js";
import { WsClient } from "../../../../test/support/wsClient.js";
import { JoinTicketStore, type JoinTicketPayload } from "../../join/joinTicket.js";
import { VoiceBridge } from "../voiceBridge.js";

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

  // cleanupEntry() releases the identity lease before the TS client has disconnected, or for as long as that takes
  // the console lists nothing and the identity stays unusable. The fake's disconnect is held open to show it.
  it("an identity is free as soon as its session has left the admin console's list", async () => {
    const gateway = await gateways.start();
    const identity = withIdentity();
    const first = await joinVoice(gateway, { nickname: "first", ...identity });
    const disconnect = first.client.disconnect.bind(first.client);
    let finishDisconnect!: () => void;
    const held = new Promise<void>((resolve) => {
      finishDisconnect = resolve;
    });
    first.client.disconnect = async () => {
      await held;
      await disconnect();
    };
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
  // stop() is started and not awaited: what the test looks at is the socket's close.
  it("tells the browser the gateway is going away (close code 1001 with a reason)", async () => {
    const gateway = await gateways.start();
    const session = await joinVoice(gateway, { nickname: "alice" });
    void gateway.stop();
    const closed = await session.socket.waitForClose();
    expect(closed.code).toBe(1001);
    expect(closed.reason).not.toBe("");
    expect(session.client.isConnected()).toBe(false);
  });
});

/** A `VoiceBridge` on its own HTTP server, so the tests can look at what it keeps between sessions. */
interface BridgeContext {
  bridge: VoiceBridge;
  ts: FakeTeamSpeakServer;
  joinTickets: JoinTicketStore;
  sockets: WsClient[];
  open(payload: Partial<JoinTicketPayload> & { nickname: string }): Promise<WsClient>;
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
    await bridge.shutdown();
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
    held: () => ({
      entries: internals.entries.size,
      leases: internals.identityLeases.owners.size,
      sockets: internals.wss.clients.size,
      sessions: bridge.getActiveCount(),
    }),
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

  // cleanupEntry() must leave the socket's listeners alone so ws forgets a socket the gateway closed
  // itself, otherwise the server keeps them all for the life of the process.
  it("no closed socket is kept after 20 joins that the gateway ends", async () => {
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
