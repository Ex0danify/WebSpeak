import { describe, expect, it } from "vitest";
import { createLink, ManualClock } from "../../../../test/support/tsLinkSimulator.js";
import { createLoopbackServer } from "../../../../test/support/tsLoopbackServer.js";
import { generateIdentity } from "../crypto/identity.js";
import { runHandshake } from "../handshake/handshake.js";
import type { PacketHandler } from "../transport/packetHandler.js";
import type { CommandRow } from "../wire/commandRows.js";
import type { ParsedCommand } from "../wire/commandText.js";
import { clientInfo, clientUpdate, version } from "./clientCommands.js";
import { CommandScheduler } from "./commandScheduler.js";
import { CommandTracker, type ServerCommand } from "./commandTracker.js";

const identity = generateIdentity(0);

/** In order, like the real servers: rows, a notification now and then, the error row last. */
function answer(command: ParsedCommand): string[] {
  const done = (id = 0, msg = "ok") => `error id=${id} msg=${msg} return_code=${command.rows.at(-1)!.return_code}`;
  if (command.name === "version") return ["version=3.13.7 build=1655727713 platform=Linux", done()];
  if (command.name === "clientinfo" && command.rows[0].clid === "3") return ["cid=1 client_nickname=Loopback\\sTester", done()];
  if (command.name === "clientinfo") return [done(512, "invalid\\sclientID")];
  if (command.name === "clientupdate") return ["notifyclientupdated clid=3 client_input_muted=1", done()];
  return [done()];
}

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

async function connect(seed: number, drop: number) {
  const clock = new ManualClock();
  const link = createLink(clock, { drop, duplicate: drop / 2, reorder: drop, reorderMs: 60 }, seed);
  const server = createLoopbackServer(link.b, { transport: { clock }, answer });
  const notifications: ServerCommand[] = [];
  const transport: { handler?: PacketHandler } = {};
  const tracker = new CommandTracker(
    { sendCommand: (payload) => transport.handler!.sendCommand(payload) },
    { notification: (command) => notifications.push(command) },
    { clock },
  );
  const connection = await drain(
    runHandshake(
      link.a,
      { identity, nickname: "Loopback Tester", transport: { clock }, testSeams: { deriveServerKey: server.deriveServerKey } },
      { command: (message) => tracker.receive(message), closed: (error) => tracker.close(error) },
    ),
    clock,
  );
  transport.handler = connection.handler;
  return { clock, connection, tracker, scheduler: new CommandScheduler(tracker, { clock }), notifications };
}

describe("commands over the loopback server", () => {
  it.each([
    [1, 0],
    [2, 0.2],
    [3, 0.2],
  ])("pairs every answer with its command (seed %i, loss %f)", async (seed, drop) => {
    const { clock, connection, scheduler, tracker, notifications } = await connect(seed, drop);
    expect(connection.clientId).toBe(3);
    const results = Promise.allSettled([
      scheduler.command(version()),
      scheduler.command(clientInfo(99)),
      scheduler.command(clientInfo(3)),
      scheduler.command(clientUpdate({ inputMuted: true }), { priority: "background" }),
      scheduler.command(version()),
    ]);
    const settled = await drain(results, clock);
    const values = settled.map((result) => (result.status === "fulfilled" ? result.value : (result.reason as { id: number }).id));
    expect(values).toEqual([
      [{ version: "3.13.7", build: "1655727713", platform: "Linux" }],
      512,
      [{ cid: "1", client_nickname: "Loopback Tester" }] satisfies CommandRow[],
      [],
      [expect.objectContaining({ version: "3.13.7" })],
    ]);
    // The welcome after initserver and the mute notification went to the events, not into answers.
    expect(notifications.map((command) => command.name)).toEqual([
      "channellist",
      "channellistfinished",
      "notifycliententerview",
      "notifyclientupdated",
    ]);
    expect(tracker.pending).toBe(0);
  });

  it("rejects what is still waiting when the connection closes", async () => {
    const { clock, connection, scheduler } = await connect(4, 0);
    connection.handler.close();
    scheduler.close();
    await expect(drain(scheduler.command(version()), clock)).rejects.toMatchObject({ code: "closed" });
  });
});
