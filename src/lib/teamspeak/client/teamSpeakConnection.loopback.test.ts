import { afterEach, describe, expect, it, vi } from "vitest";
import { createLink, ManualClock } from "../../../../test/support/tsLinkSimulator.js";
import { createLoopbackServer, type LoopbackServerOptions } from "../../../../test/support/tsLoopbackServer.js";
import { cmd } from "../../../../test/support/tsSessionScript.js";
import { version } from "../command/clientCommands.js";
import { generateIdentity } from "../crypto/identity.js";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import type { ConnectionEvent } from "./clientEvents.js";
import { TeamSpeakConnection, type TeamSpeakConnectionOptions } from "./teamSpeakConnection.js";

const identity = generateIdentity(0);

const CHANNELS = cmd(
  "channellist",
  { cid: 1, cpid: 0, channel_name: "Lobby" },
  { cid: 2, cpid: 0, channel_order: 1, channel_name: "Other" },
);
const selfEnter = (clientId: number) =>
  cmd("notifycliententerview", { cfid: 0, ctid: 1, reasonid: 2, clid: clientId, client_nickname: "Loopback Tester" });

async function drain<T>(promise: Promise<T>, clock: ManualClock): Promise<T> {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  for (let elapsed = 0; !done && elapsed < 60_000; elapsed += 5) {
    clock.advance(5);
    await Promise.resolve();
  }
  return promise;
}

async function run(clock: ManualClock, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 5) {
    clock.advance(5);
    await Promise.resolve();
  }
}

function setup(serverOptions: LoopbackServerOptions = {}, options: Partial<TeamSpeakConnectionOptions> = {}) {
  const clock = new ManualClock();
  const link = createLink(clock);
  const server = createLoopbackServer(link.b, { transport: { clock }, ...serverOptions });
  const connection = new TeamSpeakConnection({
    address: { host: "127.0.0.1", port: 9987 },
    identity,
    nickname: "Loopback Tester",
    transport: { clock },
    testSeams: { deriveServerKey: server.deriveServerKey },
    socketFactory: async () => link.a,
    ...options,
  });
  const events: ConnectionEvent[] = [];
  for (const type of ["welcomeComplete", "clientEnter", "clientLeave", "selfLeft", "closed", "notification"] as const)
    connection.on(type, (event: ConnectionEvent) => events.push(event));
  return { clock, server, connection, events };
}

async function connected(serverOptions: LoopbackServerOptions = {}) {
  const context = setup(serverOptions);
  await drain(context.connection.connect(), context.clock);
  context.events.length = 0;
  return context;
}

afterEach(() => vi.restoreAllMocks());

describe("connect", () => {
  it("resolves after the welcome, with the session filled", async () => {
    const { clock, connection, events } = setup();
    const seen: boolean[] = [];
    // Listeners see the state with the change already in it.
    connection.on("clientEnter", (event) => seen.push(connection.session.client(event.client.id) !== undefined));
    await drain(connection.connect(), clock);
    expect(connection.state).toBe("connected");
    expect(connection.clientId).toBe(3);
    expect(seen).toEqual([true]);
    expect(events.map((event) => event.type)).toEqual(["clientEnter", "welcomeComplete"]);
    expect(connection.session.snapshot()).toMatchObject({
      channels: [{ id: 1n, name: "Lobby" }, { id: 2n }],
      clients: [{ id: 3, channelID: 1n }],
    });
    expect(connection.session.server.name).toBe("Loopback");
  });

  it("waits for the channel list end when our enter view came first", async () => {
    const { clock, server, connection } = setup({ welcome: (clientId) => [CHANNELS, selfEnter(clientId)] });
    let settled = false;
    const connecting = connection.connect().finally(() => (settled = true));
    await run(clock, 2_000);
    expect(settled).toBe(false);
    expect(connection.state).toBe("connecting");
    expect(connection.session.self.channelId).toBe(1n);
    server.handler.sendCommand(Buffer.from("channellistfinished"));
    await drain(connecting, clock);
    expect(connection.state).toBe("connected");
  });

  it("times out when the welcome never ends, handshake time included", async () => {
    const { clock, connection, events } = setup({ welcome: () => [CHANNELS, "channellistfinished"] }, { timeoutMs: 3_000 });
    const started = clock.now();
    await expect(drain(connection.connect(), clock)).rejects.toMatchObject({ code: "timeout", message: expect.stringMatching(/welcome/) });
    expect(clock.now() - started).toBeLessThan(3_100);
    expect(connection.state).toBe("closed");
    expect(events.map((event) => event.type)).not.toContain("closed");
  });

  it("stops on abort during the welcome", async () => {
    const { clock, connection } = setup({ welcome: () => [CHANNELS] });
    const abort = new AbortController();
    const connecting = connection.connect({ signal: abort.signal });
    await run(clock, 1_000);
    abort.abort(new Error("user went away"));
    await expect(drain(connecting, clock)).rejects.toThrow("user went away");
    expect(connection.state).toBe("closed");
  });

  it("closes the socket of a connect aborted before it opened", async () => {
    const { clock, connection } = setup();
    const abort = new AbortController();
    abort.abort();
    await expect(drain(connection.connect({ signal: abort.signal }), clock)).rejects.toThrow("aborted");
    expect(connection.state).toBe("closed");
  });

  it("rejects with the handshake error of a refusal", async () => {
    const { clock, connection } = setup({ refuseClientInit: { id: 1028, msg: "invalid\\spassword" } });
    await expect(drain(connection.connect(), clock)).rejects.toBeInstanceOf(HandshakeError);
    expect(connection.state).toBe("closed");
  });

  it("fails the welcome when the server sends our leave during it", async () => {
    const { clock, connection } = setup({
      welcome: (clientId) => [cmd("notifyclientleftview", { cfid: 1, ctid: 0, reasonid: 5, reasonmsg: "no", clid: clientId })],
    });
    await expect(drain(connection.connect(), clock)).rejects.toMatchObject({ code: "closedByServer" });
  });

  it("connects only once and refuses commands before", async () => {
    const { clock, connection } = setup();
    await expect(connection.command(version())).rejects.toThrow(/idle, not connected/);
    expect(() => connection.send(version())).toThrow(/not connected/);
    const connecting = connection.connect();
    await expect(connection.connect()).rejects.toThrow(/only once/);
    await drain(connecting, clock);
  });
});

describe("after connect", () => {
  it("runs commands through the scheduler", async () => {
    const answer = (command: { name: string | undefined; rows: readonly Record<string, string>[] }) =>
      command.name === "version"
        ? ["version=3.13.7 build=1 platform=Linux", `error id=0 msg=ok return_code=${command.rows[0].return_code}`]
        : [];
    const { clock, connection, server } = await connected({ answer });
    expect(await drain(connection.command(version()), clock)).toEqual([{ version: "3.13.7", build: "1", platform: "Linux" }]);
    connection.send("clientupdate client_away=1");
    await run(clock, 500);
    expect(server.received.at(-1)).toBe("clientupdate client_away=1");
  });

  it("forwards notifications the session does not apply", async () => {
    const { clock, connection, server, events } = await connected();
    server.handler.sendCommand(Buffer.from("notifystreamstarted streamid=7 clid=3"));
    await run(clock, 100);
    expect(events).toMatchObject([{ type: "notification", command: { name: "notifystreamstarted" } }]);
    expect(connection.state).toBe("connected");
  });

  it("leaves with clientdisconnect and closes after the server confirms", async () => {
    const { clock, connection, server, events } = await connected();
    await drain(Promise.all([connection.disconnect({ reasonMessage: "see you" }), connection.disconnect()]), clock);
    expect(server.received.filter((text) => text.startsWith("clientdisconnect"))).toEqual([
      "clientdisconnect reasonid=8 reasonmsg=see\\syou",
    ]);
    expect(events).toMatchObject([
      { type: "clientLeave", reasonId: 8 },
      { type: "selfLeft", reasonId: 8, reasonMessage: "see you" },
      { type: "closed", error: undefined },
    ]);
    expect(connection.state).toBe("closed");
    await expect(connection.command(version())).rejects.toMatchObject({ code: "closed" });
    await connection.disconnect();
  });

  it("closes on its own when the server does not confirm the leave", async () => {
    const { clock, connection, server, events } = await connected();
    server.handler.close();
    const started = clock.now();
    await drain(connection.disconnect(), clock);
    expect(clock.now() - started).toBeGreaterThanOrEqual(2_000);
    expect(events).toEqual([{ type: "closed", error: undefined }]);
  });

  it("reports a kick and closes", async () => {
    const { clock, connection, server, events } = await connected();
    server.handler.sendCommand(
      Buffer.from(
        cmd("notifyclientleftview", { cfid: 1, ctid: 0, reasonid: 5, reasonmsg: "behave", clid: 3, invokerid: 1, invokername: "Admin" }),
      ),
    );
    await run(clock, 100);
    expect(events).toMatchObject([
      { type: "clientLeave" },
      { type: "selfLeft", reasonId: 5, reasonMessage: "behave", invoker: { id: 1, name: "Admin" } },
      { type: "closed", error: undefined },
    ]);
    expect(connection.state).toBe("closed");
  });

  it("reports the transport error of a dead server", async () => {
    const { clock, connection, server, events } = await connected();
    server.handler.close();
    await run(clock, 25_000);
    expect(events).toMatchObject([{ type: "closed", error: { code: "timeout" } }]);
    expect(connection.state).toBe("closed");
  });

  it("keeps going when a listener throws", async () => {
    const thrown: unknown[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      try {
        callback();
      } catch (error) {
        thrown.push(error);
      }
    });
    const { clock, connection, events } = setup();
    connection.once("clientEnter", () => {
      throw new Error("listener bug");
    });
    await drain(connection.connect(), clock);
    expect(thrown).toEqual([new Error("listener bug")]);
    expect(events.map((event) => event.type)).toEqual(["clientEnter", "welcomeComplete"]);
    expect(connection.listenerCount("clientEnter")).toBe(1);
  });
});

describe("disconnect before connected", () => {
  it("stops a running connect", async () => {
    const { clock, connection } = setup({ welcome: () => [CHANNELS] });
    const connecting = connection.connect();
    await run(clock, 500);
    await drain(connection.disconnect(), clock);
    await expect(connecting).rejects.toMatchObject({ code: "closed" });
    expect(connection.state).toBe("closed");
  });

  it("retires an idle connection", async () => {
    const { connection } = setup();
    await connection.disconnect();
    expect(connection.state).toBe("closed");
    await expect(connection.connect()).rejects.toThrow(/only once/);
  });
});
