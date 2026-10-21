import { describe, expect, it } from "vitest";
import { FIXTURES, hasCaptures, loadCapture } from "../../../../test/support/tsCaptureFixtures.js";
import { createLink, type LinkImpairment, ManualClock } from "../../../../test/support/tsLinkSimulator.js";
import { createLoopbackServer, type LoopbackServerOptions } from "../../../../test/support/tsLoopbackServer.js";
import { generateIdentity } from "../crypto/identity.js";
import { DUMMY_PACKET_KEY, LegacyPacketKeys } from "../crypto/packetKeys.js";
import { HandshakeError, TeamSpeakServerError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { openPacket, parsePacket } from "../transport/packetCodec.js";
import { PacketType } from "../transport/packetTypes.js";
import { hashPassword } from "./clientInit.js";
import { connectLegacy, type LegacyHandshakeOptions } from "./legacyHandshake.js";

const identity = generateIdentity(0);

interface SetupOptions {
  impairment?: LinkImpairment;
  seed?: number;
  server?: LoopbackServerOptions;
  client?: Partial<LegacyHandshakeOptions>;
}

function setup({ impairment, seed, server: serverOptions, client }: SetupOptions = {}) {
  const clock = new ManualClock();
  const c2s: Buffer[] = [];
  const link = createLink(clock, { ...impairment, filter: (datagram, side) => (side === "a" && c2s.push(datagram), false) }, seed);
  const server = createLoopbackServer(link.b, { transport: { clock }, ...serverOptions });
  const commands: string[] = [];
  const voice: Buffer[] = [];
  const closed: unknown[] = [];
  const connection = connectLegacy(
    link.a,
    {
      identity,
      nickname: "Loopback Tester",
      transport: { clock },
      testSeams: { deriveServerKey: server.deriveServerKey },
      ...client,
    },
    {
      command: (message) => commands.push(message.payload.toString()),
      voice: (packet) => voice.push(packet.payload),
      closed: (error) => closed.push(error),
    },
  );
  return { clock, link, server, connection, commands, voice, closed, c2s };
}

/** Moves the clock in small steps and lets promise callbacks run in between. */
async function settle<T>(promise: Promise<T>, clock: ManualClock, limitMs = 60_000): Promise<T> {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  for (let elapsed = 0; !done && elapsed < limitMs; elapsed += 5) {
    clock.advance(5);
    await Promise.resolve();
  }
  return promise;
}

const commandNames = (texts: string[]) => texts.map((text) => text.split(" ")[0]);

describe("legacy handshake over the loopback server", () => {
  it("connects, hands the welcome over in order and disconnects", async () => {
    const { clock, server, connection, commands } = setup({ client: { serverPassword: "secret" } });
    const result = await settle(connection, clock);
    expect(result.clientId).toBe(3);
    expect(result.handler.clientId).toBe(3);
    expect(result.initServer.virtualserver_name).toBe("Loopback");
    expect(server.solvedPuzzles).toBe(1);
    expect(server.clientInit).toMatchObject({ client_nickname: "Loopback Tester", client_server_password: hashPassword("secret") });

    clock.advance(1_000);
    expect(commandNames(commands)).toEqual(["channellist", "channellistfinished", "notifycliententerview"]);
    result.handler.sendCommand(Buffer.from("clientdisconnect reasonid=8 reasonmsg=leaving"));
    clock.advance(1_000);
    expect(server.received).toEqual(["clientdisconnect reasonid=8 reasonmsg=leaving"]);
    expect(commands.at(-1)).toContain("notifyclientleftview");
    expect(result.handler.pendingCommands).toBe(0);
  });

  it("keeps the connection alive with pings once connected", async () => {
    const { clock, connection, closed } = setup();
    const result = await settle(connection, clock);
    clock.advance(120_000);
    expect(closed).toEqual([]);
    expect(result.handler.closed).toBe(false);
    expect(result.handler.smoothedRttMs).toBeGreaterThan(0);
  });

  it("gets through loss, duplicates and reordering", async () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { clock, connection, commands } = setup({
        seed,
        impairment: { drop: 0.25, duplicate: 0.15, reorder: 0.3, reorderMs: 80 },
        server: { welcomePadding: 3_000 },
      });
      const result = await settle(connection, clock);
      expect(result.clientId, `seed ${seed}`).toBe(3);
      clock.advance(30_000);
      expect(commandNames(commands), `seed ${seed}`).toEqual(["channellist", "channellistfinished", "notifycliententerview"]);
    }
  });

  it("starts over when the server asks for an Init1 restart", async () => {
    const { clock, connection, server } = setup({ server: { restartOnce: true } });
    await expect(settle(connection, clock)).resolves.toMatchObject({ clientId: 3 });
    expect(server.solvedPuzzles).toBe(1);
  });

  it("refuses a server whose proof does not match its license and closes the socket", async () => {
    const { clock, link, connection } = setup({ server: { forgeProof: true } });
    const error = await settle(connection, clock).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HandshakeError);
    expect(error).toMatchObject({ step: "initivexpand2", message: expect.stringContaining("proof") });
    expect(link.a.closed).toBe(true);
  });

  it("surfaces a refused clientinit as a HandshakeError with the server error as cause", async () => {
    const { clock, connection } = setup({ server: { refuseClientInit: { id: 1028, msg: "invalid server password" } } });
    const error = (await settle(connection, clock).catch((caught: unknown) => caught)) as HandshakeError;
    expect(error).toBeInstanceOf(HandshakeError);
    expect(error.step).toBe("clientinit");
    expect(error.cause).toBeInstanceOf(TeamSpeakServerError);
    expect(error.cause).toMatchObject({ id: 1028, serverMessage: "invalid server password" });
  });

  it("fails with a transport timeout when the server never answers", async () => {
    const { clock, link, connection } = setup({ impairment: { drop: 1 } });
    const error = await settle(connection, clock).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TeamSpeakTransportError);
    expect(error).toMatchObject({ code: "timeout" });
    expect(clock.now()).toBe(20_000);
    expect(link.a.closed).toBe(true);
  });

  it("stops on abort, also when the signal is aborted before the start", async () => {
    const controller = new AbortController();
    const { clock, link, server, connection } = setup({ impairment: { drop: 1 }, client: { signal: controller.signal } });
    clock.advance(500);
    controller.abort(new Error("user left"));
    await expect(settle(connection, clock)).rejects.toThrow("user left");
    expect(link.a.closed).toBe(true);
    server.handler.close();
    expect(clock.pendingTimers).toBe(0);

    const early = setup({ client: { signal: AbortSignal.abort() } });
    await expect(early.connection).rejects.toThrow();
    expect(early.link.a.closed).toBe(true);
  });

  it("refuses the alpha handshake and an initserver without a client id", async () => {
    const alpha = setup({ server: { expandAnswer: "initivxalpha l=AQ== beta=AA== omega=x" } });
    await expect(settle(alpha.connection, alpha.clock)).rejects.toThrow(/unsupported handshake answer initivxalpha/);
    for (const aclid of ["0", "x"]) {
      const broken = setup({ server: { initServerFields: { aclid } } });
      await expect(settle(broken.connection, broken.clock)).rejects.toMatchObject({ step: "initserver" });
    }
  });

  it("passes over successful answers and stray commands during the handshake", async () => {
    const { clock, connection, server } = setup({
      server: { beforeInitServer: ["error id=0 msg=ok", "notifyserverupdated virtualserver_name=early"] },
    });
    await expect(settle(connection, clock)).resolves.toMatchObject({ clientId: 3 });
    expect(server.clientInit).toBeDefined();
  });

  it("ignores low priority commands during the handshake and forwards voice after it", async () => {
    const { clock, connection, server, voice, commands } = setup();
    clock.advance(1);
    server.handler.sendCommand(Buffer.from("notifyearly"), { low: true });
    const result = await settle(connection, clock);
    server.handler.sendVoice(PacketType.voice, Buffer.from([0, 3, 4, 9]));
    clock.advance(100);
    expect(voice).toHaveLength(1);
    expect(commands).not.toContain("notifyearly");
    expect(result.clientId).toBe(3);
  });

  it("rejects with a plain error when aborted without an Error reason", async () => {
    const controller = new AbortController();
    const { clock, connection } = setup({ impairment: { drop: 1 }, client: { signal: controller.signal } });
    controller.abort("gone");
    await expect(settle(connection, clock)).rejects.toThrow("aborted");
  });

  it("reports a close after the handshake to the connection's events", async () => {
    const { clock, connection, closed } = setup();
    const result = await settle(connection, clock);
    result.handler.close(new TeamSpeakTransportError("closedByServer", "gone"));
    expect(closed).toEqual([expect.objectContaining({ code: "closedByServer" })]);
  });
});

type KeyKind = "dummy" | "session" | "none";

describe.skipIf(!hasCaptures)("legacy handshake key order against the TS3 capture", () => {
  it("switches keys at the same packets as the native client", async () => {
    const { clock, server, connection, c2s } = setup();
    await settle(connection, clock);
    const session = new LegacyPacketKeys(server.ivStruct!);
    const ours = new Map<string, KeyKind>();
    for (const datagram of c2s) {
      const packet = parsePacket("c2s", datagram)!;
      if (packet.type !== PacketType.command && packet.type !== PacketType.ack) continue;
      const kind: KeyKind = openPacket(packet, DUMMY_PACKET_KEY, undefined)
        ? "dummy"
        : openPacket(packet, session.keyFor("c2s", packet.type, 0, packet.id), undefined)
          ? "session"
          : "none";
      ours.set(`${packet.type}:${packet.id}`, kind);
    }
    const captured = new Map<string, KeyKind>();
    for (const packet of loadCapture(FIXTURES.ts3Packets).packets) {
      if (packet.direction !== "c2s" || !packet.key) continue;
      captured.set(`${packet.type}:${packet.packetId}`, packet.key.equals(DUMMY_PACKET_KEY.key) ? "dummy" : "session");
    }
    // Ack of initivexpand2, clientek, ack of initserver.
    for (const id of ["6:0", "2:1", "6:1"]) expect(ours.get(id), id).toBe(captured.get(id));
    expect(captured.get("6:0")).toBe("dummy");
    // The capture leaves clientinit out (it held account data), the command after it shows the switch.
    const firstAfterClientEk = [...captured].find(([id]) => id.startsWith("2:") && Number(id.slice(2)) > 1);
    expect(firstAfterClientEk?.[1]).toBe("session");
    expect(ours.get("2:2")).toBe("session");
  });
});
