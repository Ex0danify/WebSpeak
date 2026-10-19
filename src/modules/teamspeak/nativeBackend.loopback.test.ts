import type { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createLink, ManualClock } from "../../../test/support/tsLinkSimulator.js";
import { createLoopbackServer, type LoopbackServerOptions } from "../../../test/support/tsLoopbackServer.js";
import { cmd } from "../../../test/support/tsSessionScript.js";
import { silentLogger } from "../../../test/support/fakeTsBackend.js";
import { generateIdentity, TeamSpeakConnection, TeamSpeakServerError } from "../../lib/teamspeak/index.js";
import { PacketFlag, PacketType } from "../../lib/teamspeak/transport/packetTypes.js";
import { WebSpeakError } from "../../shared/errors.js";
import { NativeBackend } from "./nativeBackend.js";
import type { TeamSpeakBackendEvents } from "./teamSpeakBackend.js";

const identity = generateIdentity(0);
const OPUS = Buffer.from([0xf8, 0xff, 0xfe]);

async function run(clock: ManualClock, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 5) {
    clock.advance(5);
    await Promise.resolve();
  }
}

/** Answers every tracked command with success, `version` with a row. */
const answerAll: LoopbackServerOptions["answer"] = (command) => {
  const returnCode = command.rows[0]?.return_code;
  if (returnCode === undefined) return [];
  const rows = command.name === "version" ? ["version=3.13.7 build=1 platform=Linux"] : [];
  if (command.name === "clientmove" && command.rows[0]?.cid === "99")
    return [`error id=768 msg=invalid\\schannelID return_code=${returnCode}`];
  return [...rows, `error id=0 msg=ok return_code=${returnCode}`];
};

type Recorded = { [K in keyof TeamSpeakBackendEvents]: { type: K; payload: TeamSpeakBackendEvents[K][0] } }[keyof TeamSpeakBackendEvents];

async function connected(serverOptions: LoopbackServerOptions = {}) {
  const clock = new ManualClock();
  const link = createLink(clock);
  const server = createLoopbackServer(link.b, {
    transport: { clock },
    answer: answerAll,
    initServerFields: { virtualserver_version: "3.13.7 [Build: 1654598422]" },
    welcome: (clientId, nickname) => [
      cmd("channellist", { cid: 1, cpid: 0, channel_name: "Lobby" }, { cid: 2, cpid: 0, channel_order: 1, channel_name: "Talk" }),
      "channellistfinished",
      // One batch like real servers send it, the leading fields apply to every row.
      cmd(
        "notifycliententerview",
        { cfid: 0, ctid: 1, reasonid: 2, clid: clientId, client_nickname: nickname },
        { clid: 7, client_nickname: "Other", client_away: 1 },
      ),
    ],
    ...serverOptions,
  });
  const backend = new NativeBackend(
    {
      transportTarget: { host: "127.0.0.1", port: 9987 },
      serverHost: "ts.example",
      nickname: "Native Tester",
      identity,
    },
    silentLogger,
    {
      resolve: async (host, port) => ({ host, port }),
      connection: (options) =>
        new TeamSpeakConnection({
          ...options,
          transport: { ...options.transport, clock },
          testSeams: { deriveServerKey: server.deriveServerKey },
          socketFactory: async () => link.a,
        }),
    },
  );
  const events: Recorded[] = [];
  for (const type of [
    "directorySnapshot",
    "clientEnter",
    "clientLeave",
    "clientMoved",
    "clientUpdated",
    "kicked",
    "disconnected",
    "textMessage",
    "poked",
    "rawNotification",
    "voiceData",
  ] as const)
    (backend as EventEmitter).on(type, (payload: unknown) => events.push({ type, payload } as Recorded));
  const connecting = backend.connect();
  await run(clock, 3_000);
  await connecting;
  const push = async (...texts: string[]) => {
    for (const text of texts) server.handler.sendCommand(Buffer.from(text));
    await run(clock, 50);
  };
  return { clock, server, backend, events, push };
}

describe("NativeBackend on the loopback server", () => {
  it("hands the welcome on as one snapshot, with the status fields of everyone in it", async () => {
    const { backend, events } = await connected();
    expect(backend.clientId()).toBe(3);
    expect(backend.channelId()).toBe(1n);
    expect(backend.protocol).toBe("ts3");
    const snapshots = events.filter((event) => event.type === "directorySnapshot");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.payload).toMatchObject({
      channels: [
        { id: 1n, parentID: 0n, name: "Lobby" },
        { id: 2n, parentID: 0n, order: 1n, name: "Talk" },
      ],
      clients: [
        { id: 3, nickname: "Native Tester", channelID: 1n, away: false },
        { id: 7, nickname: "Other", channelID: 1n, away: true },
      ],
    });
  });

  it("answers commands with plain rows and rejects a refusal with the server error", async () => {
    const { clock, backend } = await connected();
    const version = backend.command("version");
    await run(clock, 50);
    expect(await version).toEqual([{ version: "3.13.7", build: "1", platform: "Linux" }]);
    const move = backend.command("clientmove clid=3 cid=99");
    const refused = expect(move).rejects.toMatchObject({ id: 768 });
    await run(clock, 50);
    await refused;
    await expect(move).rejects.toBeInstanceOf(TeamSpeakServerError);
  });

  it("forwards moves, updates and leaves in the old event shapes", async () => {
    const { events, push } = await connected();
    events.length = 0;
    await push(
      cmd("notifyclientmoved", { ctid: 2, reasonid: 1, clid: 7, invokerid: 3, invokername: "Native Tester", invokeruid: "u" }),
      cmd("notifyclientupdated", { clid: 7, client_input_muted: 1 }),
      cmd("notifyclientleftview", { cfid: 2, ctid: 0, reasonid: 8, reasonmsg: "gone", clid: 7 }),
    );
    expect(events).toEqual([
      {
        type: "clientMoved",
        payload: { id: 7, targetChannelID: 2n, reasonID: 1, invokerID: 3, invokerName: "Native Tester", invokerUID: "u" },
      },
      { type: "clientUpdated", payload: expect.objectContaining({ id: 7, inputMuted: true, away: true }) },
      { type: "clientLeave", payload: { id: 7, reasonID: 8, reasonMsg: "gone", targetID: 0 } },
    ]);
  });

  it("follows every channel change with a full snapshot, and drops the clients of a deleted channel", async () => {
    const { events, push } = await connected();
    events.length = 0;
    await push(cmd("notifychannelcreated", { cid: 4, cpid: 0, channel_order: 2, channel_name: "New" }));
    expect(events.map((event) => event.type)).toEqual(["directorySnapshot"]);
    expect((events[0]!.payload as { channels: unknown[] }).channels).toHaveLength(3);
    await push(cmd("notifyclientmoved", { ctid: 2, reasonid: 0, clid: 7 }));
    events.length = 0;
    await push(cmd("notifychanneldeleted", { cid: 2 }));
    expect(events.map((event) => event.type)).toEqual(["clientLeave", "directorySnapshot"]);
    expect(events[0]!.payload).toMatchObject({ id: 7 });
  });

  it("reports a kick and then the end of the connection", async () => {
    const { events, push } = await connected();
    events.length = 0;
    await push(cmd("notifyclientleftview", { cfid: 1, ctid: 0, reasonid: 5, reasonmsg: "bye", clid: 3, invokerid: 7 }));
    expect(events.map((event) => event.type)).toEqual(["clientLeave", "kicked", "disconnected"]);
    const kick = events[1]!.payload as WebSpeakError;
    expect(kick).toBeInstanceOf(WebSpeakError);
    expect(kick.diagnostics).toMatchObject({ id: "5", serverMessage: "bye" });
    expect(events[2]!.payload).toBeUndefined();
  });

  it("does not take a timeout for a kick", async () => {
    const { events, push } = await connected();
    events.length = 0;
    await push(cmd("notifyclientleftview", { cfid: 1, ctid: 0, reasonid: 3, reasonmsg: "", clid: 3 }));
    expect(events.map((event) => event.type)).toEqual(["clientLeave", "disconnected"]);
  });

  it("maps chat, pokes and other notifications", async () => {
    const { events, push } = await connected();
    events.length = 0;
    await push(
      cmd("notifytextmessage", { targetmode: 1, msg: "hi there", target: 3, invokerid: 7, invokername: "Other", invokeruid: "o" }),
      cmd("notifyclientpoke", { msg: "hey", invokerid: 7, invokername: "Other", invokeruid: "o" }),
      cmd("notifystreamstarted", { id: 1, clid: 7 }, { id: 2, clid: 8 }),
    );
    expect(events).toEqual([
      {
        type: "textMessage",
        payload: { invokerName: "Other", invokerId: 7, invokerUid: "o", message: "hi there", targetMode: 1, targetId: 3n },
      },
      { type: "poked", payload: { invokerID: 7, invokerName: "Other", invokerUID: "o", message: "hey" } },
      { type: "rawNotification", payload: { name: "notifystreamstarted", params: { id: "1", clid: "7" } } },
      { type: "rawNotification", payload: { name: "notifystreamstarted", params: { id: "2", clid: "8" } } },
    ]);
  });

  it("passes voice on as its own buffer and leaves out the empty end-of-transmission frame", async () => {
    const { clock, server, events } = await connected();
    events.length = 0;
    const voice = (clientId: number, data: Buffer) => {
      const body = Buffer.alloc(3 + data.length);
      body.writeUInt16BE(clientId, 0);
      body[2] = 4;
      data.copy(body, 3);
      server.handler.sendVoice(PacketType.voice, body, PacketFlag.unencrypted);
    };
    voice(7, OPUS);
    voice(7, Buffer.alloc(0));
    await run(clock, 50);
    expect(events).toEqual([{ type: "voiceData", payload: { clientId: 7, codec: 4, data: OPUS } }]);
  });

  it("sends voice and whisper to the server", async () => {
    const { clock, server, backend } = await connected();
    backend.sendVoice(OPUS, 4);
    backend.sendWhisper(OPUS, [7], 4);
    await run(clock, 50);
    expect(server.voice.map((packet) => packet.type)).toEqual([PacketType.voice, PacketType.voiceWhisper]);
  });

  it("refuses commands once it left, and leaves cleanly", async () => {
    const { clock, server, backend, events } = await connected();
    const leaving = backend.disconnect();
    await run(clock, 100);
    await leaving;
    expect(server.received.at(-1)).toMatch(/^clientdisconnect /);
    expect(events.at(-1)).toEqual({ type: "disconnected", payload: undefined });
    await expect(backend.command("version")).rejects.toThrow("not ready");
  });

  it("rejects connect with a normalized error when the server refuses clientinit", async () => {
    const clock = new ManualClock();
    const link = createLink(clock);
    const server = createLoopbackServer(link.b, { transport: { clock }, refuseClientInit: { id: 1028, msg: "invalid server password" } });
    const backend = new NativeBackend(
      { transportTarget: { host: "127.0.0.1", port: 9987 }, serverHost: "127.0.0.1", nickname: "Refused", identity },
      silentLogger,
      {
        resolve: async (host, port) => ({ host, port }),
        connection: (options) =>
          new TeamSpeakConnection({
            ...options,
            transport: { ...options.transport, clock },
            testSeams: { deriveServerKey: server.deriveServerKey },
            socketFactory: async () => link.a,
          }),
      },
    );
    const connecting = backend.connect();
    const failed = expect(connecting).rejects.toMatchObject({ code: "authentication_failed" });
    await run(clock, 3_000);
    await failed;
  });
});
