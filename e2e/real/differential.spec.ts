import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { identityFromString } from "../../src/lib/teamspeak/index.js";
import { NativeBackend } from "../../src/modules/teamspeak/nativeBackend";
import { SdkBackend } from "../../src/modules/teamspeak/sdkBackend";
import { TSClient } from "../../src/modules/teamspeak/teamSpeakClient";
import type { TeamSpeakBackendFactory } from "../../src/modules/teamspeak/teamSpeakBackend";
import { poll } from "../helpers/poll";
import { expect, JOIN_PACE_MS, test } from "./fixtures";
import { GUEST_IDENTITY, identities } from "./identities";
import { type RealServer, type WebQuery, silentLogger } from "./server";

// The same scripted session once on the old SDK and once on the own client, both logs normalized (roles instead of client
// ids, names instead of channel ids) and compared. Kicks and the ban come from WebQuery, the channel edits from an admin identity.

type Kind = "sdk" | "native";
type Entry = (string | number | boolean | null)[];
type SnapshotChannel = { id: bigint; parentID: bigint; order: bigint; name: string };

const OPUS_SILENCE = Buffer.from([0xf8, 0xff, 0xfe]);
const logs = new Map<Kind, { a: Entry[]; b: Entry[]; checks: Record<string, unknown> }>();
const outDir = fileURLToPath(new URL("../../test-results/real/", import.meta.url));

const factories: Record<Kind, TeamSpeakBackendFactory> = {
  sdk: (options, logger) => new SdkBackend(options, logger),
  native: (options, logger) => new NativeBackend(options, logger),
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Recorder {
  private readonly raw: Entry[] = [];
  readonly roles = new Map<number, string>();
  readonly channels = new Map<string, string>();
  lastSnapshotChannels: SnapshotChannel[] = [];
  firstSnapshotNames: string[] | null = null;

  constructor(readonly client: TSClient) {
    // Ids are named only when read, an event can come before both ids are known.
    const role = (id: number) => `@${id}`;
    const channel = (id: bigint) => this.channels.get(String(id)) ?? `#${id}`;
    client.on("directorySnapshot", (snapshot: { channels: SnapshotChannel[]; clients: { id: number; nickname: string }[] }) => {
      this.lastSnapshotChannels = snapshot.channels;
      for (const c of snapshot.channels) this.channels.set(String(c.id), c.name);
      this.firstSnapshotNames ??= snapshot.clients.map((c) => c.nickname).sort();
    });
    client.on("clientEnter", (info: { id: number }) => this.raw.push(["clientEnter", role(info.id)]));
    client.on("clientLeave", (info: { id: number; reasonID: number }) => this.raw.push(["clientLeave", role(info.id), info.reasonID]));
    client.on("clientMoved", (info: { id: number; targetChannelID: bigint; reasonID: number }) =>
      this.raw.push(["clientMoved", role(info.id), channel(info.targetChannelID), info.reasonID]),
    );
    client.on("clientUpdated", (info: { id: number; away?: boolean; awayMessage?: string; inputMuted?: boolean; outputMuted?: boolean }) =>
      this.raw.push([
        "clientUpdated",
        role(info.id),
        info.away ?? null,
        info.awayMessage ?? null,
        info.inputMuted ?? null,
        info.outputMuted ?? null,
      ]),
    );
    client.on("textMessage", (m: { invokerId: number; message: string; targetMode: number }) =>
      this.raw.push(["textMessage", role(m.invokerId), m.targetMode, m.message]),
    );
    client.on("poked", (p: { invokerID: number; message: string }) => this.raw.push(["poked", role(p.invokerID), p.message]));
    client.on("voiceData", (v: { clientId: number; codec: number; data: Buffer }) =>
      this.raw.push(["voiceData", role(v.clientId), v.codec, v.data.length]),
    );
    client.on("rawNotification", (n: { name: string }) => this.raw.push(["rawNotification", n.name]));
    client.on("kicked", (k: { code: string; diagnostics: { id?: string } }) => this.raw.push(["kicked", k.code, k.diagnostics.id ?? null]));
    client.on("disconnected", (error?: Error) => this.raw.push(["disconnected", error ? error.name : null]));
  }

  get entries(): Entry[] {
    return this.raw.map((entry) =>
      entry.map((value) =>
        typeof value === "string" && /^@\d+$/.test(value) ? (this.roles.get(Number(value.slice(1))) ?? "other") : value,
      ),
    );
  }

  has(...entry: Entry): boolean {
    return this.entries.some((e) => JSON.stringify(e) === JSON.stringify(entry));
  }
}

async function until(recorder: Recorder, what: string, ...entry: Entry): Promise<void> {
  await poll(
    async () => recorder.has(...entry),
    (found) => found,
    { timeoutMs: 10_000, message: `${what}: ${JSON.stringify(entry)}` },
  ).catch((error: Error) => {
    throw new Error(`${error.message}\nRecorded: ${JSON.stringify(recorder.entries)}`);
  });
}

/** For what the two clients may do differently: waits until it happened or a few seconds passed, never fails. */
async function settle(happened: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!happened() && Date.now() < deadline) await wait(50);
  await wait(300);
}

/** Listeners go on before connect(), like the voice module's: the welcome snapshot comes during it. */
async function connect(server: RealServer, kind: Kind, index: number, nickname: string): Promise<Recorder> {
  await wait(JOIN_PACE_MS);
  const identity = identityFromString(identities.get(index).privateMaterial);
  const client = new TSClient({ target: { host: server.host, port: server.voicePort }, nickname, identity }, silentLogger, factories[kind]);
  const recorder = new Recorder(client);
  await client.connect();
  return recorder;
}

/** The server's own channel order under `parent`, top to bottom. */
async function serverOrder(query: WebQuery, parent: string): Promise<string[]> {
  const rows = (await query.call("channellist")).filter((row) => row.pid === parent);
  const byOrder = new Map(rows.map((row) => [row.channel_order, row]));
  const names: string[] = [];
  for (let next = byOrder.get("0"); next; next = byOrder.get(next.cid)) names.push(next.channel_name);
  return names;
}

function snapshotOrder(recorder: Recorder, parent: string): string[] {
  const rows = recorder.lastSnapshotChannels.filter((c) => String(c.parentID) === parent);
  const byOrder = new Map(rows.map((c) => [String(c.order), c]));
  const names: string[] = [];
  for (let next = byOrder.get("0"); next; next = byOrder.get(String(next.id))) names.push(next.name);
  return names;
}

/** Names the step in the error, a server refusal carries only the SDK's own stack. */
async function step<T>(label: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

async function session(kind: Kind, server: RealServer, query: WebQuery, channel: { name: string; id: string }) {
  const checks: Record<string, unknown> = {};
  const b = await connect(server, kind, GUEST_IDENTITY, `diff-${kind}-b`);
  const a = await connect(server, kind, 0, `diff-${kind}-a`);
  const idA = a.client.getClientId();
  const idB = b.client.getClientId();
  for (const r of [a, b]) {
    r.roles.set(idA, "A");
    r.roles.set(idB, "B");
  }
  // A came second, its welcome has to list B (the reason the gateway pulled a second snapshot on TS6).
  checks.welcomeOfA = a.firstSnapshotNames;
  checks.testChannel = channel.name;
  await until(b, "B sees A enter", "clientEnter", "A");

  await step("A switches channel", () => a.client.switchChannel(BigInt(channel.id)));
  await until(b, "B sees A move", "clientMoved", "A", channel.name, 0);
  await step("A setAway", () => a.client.setAway(true, "brb | tab\there"));
  await step("A setInputMuted", () => a.client.setInputMuted(true));
  await step("A setOutputMuted", () => a.client.setOutputMuted(true));
  await poll(
    async () => b.entries.filter((e) => e[0] === "clientUpdated" && e[1] === "A").length,
    (n) => n >= 3,
    { message: "B sees A's updates" },
  );
  await step("A private message", () => a.client.sendTextMessage("private", "hello | pipe\ttab / slash", BigInt(idB)));
  await until(b, "B gets the private message", "textMessage", "A", 1, "hello | pipe\ttab / slash");
  await step("A server message", () => a.client.sendTextMessage("server", "to everyone"));
  await until(b, "B gets the server message", "textMessage", "A", 3, "to everyone");
  await step("A poke", () => a.client.poke(idB, "wake up"));
  await until(b, "B gets the poke", "poked", "A", "wake up");
  for (let frame = 0; frame < 5; frame++) {
    a.client.sendWhisper(OPUS_SILENCE, [idB]);
    await wait(20);
  }
  await wait(500);
  checks.whisperFramesAtB = b.entries.filter((e) => e[0] === "voiceData").length;

  // Channel edits by an admin identity: create two, put the second on top, rename and delete. The session has to keep the
  // sibling order like the server does.
  const run = (command: string) => step(`A ${command.split(" ")[0]}`, () => a.client.execCommandWithResponse(command, 5000));
  const create = async (name: string, extra = "") => {
    await run(`channelcreate channel_name=${name} cpid=${channel.id} channel_flag_permanent=1${extra}`);
    const rows = await poll(
      async () => (await query.call("channellist")).filter((row) => row.channel_name === name),
      (found) => found.length === 1,
      { message: `channel ${name} on the server` },
    );
    return rows[0]!.cid;
  };
  const first = await create(`diff-${kind}-first`);
  const second = await create(`diff-${kind}-second`, ` channel_order=${first}`);
  await run(`channeledit cid=${second} channel_order=0`);
  await run(`channeledit cid=${first} channel_name=diff-${kind}-renamed`);
  await wait(500);
  checks.orderAfterMove = {
    server: await serverOrder(query, channel.id),
    a: snapshotOrder(a, channel.id),
    b: snapshotOrder(b, channel.id),
  };
  await run(`channeldelete cid=${second} force=1`);
  await wait(500);
  checks.orderAfterDelete = {
    server: await serverOrder(query, channel.id),
    a: snapshotOrder(a, channel.id),
    b: snapshotOrder(b, channel.id),
  };
  await run(`channeldelete cid=${first} force=1`);

  await step("A sendProtocolCommand", () => a.client.sendProtocolCommand(`requeststreaminfo clid=${idB}`));
  await step("A moveClient", () => a.client.moveClient(idB, BigInt(channel.id)));
  await until(b, "B is moved by A", "clientMoved", "B", channel.name, 1);
  await query.call("clientkick", { clid: idB, reasonid: 4, reasonmsg: "diff channel kick" });
  await poll(
    async () => b.entries.some((e) => e[0] === "clientMoved" && e[1] === "B" && e[3] === 4),
    (x) => x,
    { message: "B kicked from the channel" },
  );

  await query.call("clientkick", { clid: idA, reasonid: 5, reasonmsg: "diff server kick" });
  await settle(() => a.entries.some((e) => e[0] === "disconnected") && b.entries.some((e) => e[0] === "clientLeave" && e[1] === "A"));
  try {
    await query.call("banclient", { clid: idB, time: 60, banreason: "diff ban" });
    await settle(() => b.entries.some((e) => e[0] === "disconnected"));
  } finally {
    await query.call("bandelall");
  }
  await step("A disconnect", () => a.client.disconnect());
  await b.client.disconnect();
  logs.set(kind, { a: a.entries, b: b.entries, checks });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}differential-${kind}.json`, JSON.stringify(logs.get(kind), null, 1));
}

test.describe.serial("old SDK and own client side by side", () => {
  test.setTimeout(180_000);

  for (const kind of ["sdk", "native"] as const) {
    test(`scripted session on ${kind}`, async ({ server, query, testChannel }) => {
      await session(kind, server, query, await testChannel(`diff-${kind}`));
    });
  }

  test("both logs tell the same story", () => {
    const sdk = logs.get("sdk")!;
    const native = logs.get("native")!;
    console.log(JSON.stringify({ sdk: sdk.checks, native: native.checks }, null, 1));

    // A came second, and its welcome already lists B on both: the second snapshot pull was not needed.
    expect(sdk.checks.welcomeOfA).toEqual(["diff-sdk-a", "diff-sdk-b", "serveradmin"]);
    expect(native.checks.welcomeOfA).toEqual(["diff-native-a", "diff-native-b", "serveradmin"]);
    // The own client keeps the sibling order the server has after a reorder, the SDK lost a channel.
    for (const check of ["orderAfterMove", "orderAfterDelete"]) {
      const order = native.checks[check] as { server: string[]; a: string[]; b: string[] };
      expect(order.a).toEqual(order.server);
      expect(order.b).toEqual(order.server);
    }

    // Explained differences, left out of the comparison: the SDK also forwarded notifications it applied itself (only the
    // stream ones matter to the gateway), and repeated a client without status on every channel group change.
    const comparable = (log: { a: Entry[]; b: Entry[]; checks: Record<string, unknown> }, kind: Kind) => (entries: Entry[]) =>
      entries
        .map((entry) =>
          entry.map((value) => (value === log.checks.testChannel ? "TEST" : typeof value === "string" ? value.replace(kind, "K") : value)),
        )
        .filter((entry) => entry[0] !== "rawNotification" || String(entry[1]).startsWith("notifystream"))
        .filter((entry) => !(entry[0] === "clientUpdated" && entry[2] === null))
        .filter((entry) => entry[0] !== "kicked" && entry[0] !== "disconnected");
    expect(comparable(native, "native")(native.a)).toEqual(comparable(sdk, "sdk")(sdk.a));
    expect(comparable(native, "native")(native.b)).toEqual(comparable(sdk, "sdk")(sdk.b));

    // The end of the session is where the own client differs on purpose: a server kick ends the connection with its
    // reason, and a ban (6) is reported at all, where the SDK left B waiting.
    const ending = (entries: Entry[]) => entries.filter((entry) => entry[0] === "kicked" || entry[0] === "disconnected");
    expect(ending(sdk.a)).toEqual([["kicked", "kicked", "5"]]);
    expect(ending(native.a)).toEqual([
      ["kicked", "kicked", "5"],
      ["disconnected", null],
    ]);
    expect(ending(sdk.b)).toEqual([]);
    expect(ending(native.b)).toEqual([
      ["kicked", "banned", "6"],
      ["disconnected", null],
    ]);
  });
});
