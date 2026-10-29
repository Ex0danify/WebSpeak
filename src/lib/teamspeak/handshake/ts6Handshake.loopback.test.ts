import { describe, expect, it } from "vitest";
import { createLink, type LinkImpairment, ManualClock } from "../../../../test/support/tsLinkSimulator.js";
import { createLoopbackServer, type LoopbackServerOptions } from "../../../../test/support/tsLoopbackServer.js";
import { generateIdentity } from "../crypto/identity.js";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import { runHandshake, type HandshakeOptions } from "./handshake.js";

const identity = generateIdentity(0);

interface SetupOptions {
  impairment?: LinkImpairment;
  seed?: number;
  server?: LoopbackServerOptions;
  client?: Partial<HandshakeOptions>;
}

function setup({ impairment, seed, server: serverOptions, client }: SetupOptions = {}) {
  const clock = new ManualClock();
  const link = createLink(clock, impairment, seed);
  const server = createLoopbackServer(link.b, { transport: { clock }, ts6: true, ...serverOptions });
  const commands: string[] = [];
  const connection = runHandshake(
    link.a,
    {
      identity,
      nickname: "Alpha Tester",
      handshake: "ts6",
      transport: { clock },
      testSeams: { deriveServerKey: server.deriveServerKey },
      ...client,
    },
    {
      command: (message) => commands.push(message.payload.toString()),
      voice: () => {},
      closed: () => {},
    },
  );
  return { clock, link, server, connection, commands };
}

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

describe("alpha handshake over the loopback server", () => {
  it("connects, hands the welcome over in order and uses the 256-bit session keys", async () => {
    const { clock, server, connection, commands } = setup();
    const result = await settle(connection, clock);
    expect(result.clientId).toBe(3);
    expect(server.clientInit).toMatchObject({ client_nickname: "Alpha Tester" });
    expect(server.ivStruct).toHaveLength(64);

    clock.advance(1_000);
    expect(commandNames(commands)).toEqual(["channellist", "channellistfinished", "notifycliententerview"]);
    result.handler.sendCommand(Buffer.from("clientdisconnect reasonid=8 reasonmsg=leaving"));
    clock.advance(1_000);
    expect(server.received).toEqual(["clientdisconnect reasonid=8 reasonmsg=leaving"]);
  });

  it("gets through loss, duplicates and reordering", async () => {
    for (const seed of [1, 2, 3]) {
      const { clock, connection, commands } = setup({
        seed,
        impairment: { drop: 0.2, duplicate: 0.1, reorder: 0.25, reorderMs: 80 },
      });
      const result = await settle(connection, clock);
      expect(result.clientId, `seed ${seed}`).toBe(3);
      clock.advance(30_000);
      expect(commandNames(commands), `seed ${seed}`).toEqual(["channellist", "channellistfinished", "notifycliententerview"]);
    }
  });

  it("refuses a server whose alpha proof does not match and closes the socket", async () => {
    const { clock, link, connection } = setup({ server: { forgeProof: true } });
    const error = await settle(connection, clock).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HandshakeError);
    expect(error).toMatchObject({ step: "initivxalpha", message: expect.stringContaining("proof") });
    expect(link.a.closed).toBe(true);
  });

  it("auto follows the version profile", async () => {
    const ts6 = setup({ client: { handshake: "auto", versionProfile: "ts6" } });
    await expect(settle(ts6.connection, ts6.clock)).resolves.toMatchObject({ clientId: 3 });

    const ts3 = setup({ server: { ts6: false }, client: { handshake: "auto", versionProfile: "ts3" } });
    await expect(settle(ts3.connection, ts3.clock)).resolves.toMatchObject({ clientId: 3 });
  });
});
