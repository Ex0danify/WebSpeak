import { afterEach, describe, expect, it } from "vitest";
import { type FileServer, sendFile, startFileServer } from "../../../../test/support/tsFileServer.js";
import { createLink, ManualClock } from "../../../../test/support/tsLinkSimulator.js";
import { createLoopbackServer, type LoopbackServerOptions } from "../../../../test/support/tsLoopbackServer.js";
import { cmd } from "../../../../test/support/tsSessionScript.js";
import { generateIdentity } from "../crypto/identity.js";
import { TeamSpeakServerError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import type { ParsedCommand } from "../wire/commandText.js";
import type { ConnectionEvent } from "./clientEvents.js";
import { TeamSpeakConnection } from "./teamSpeakConnection.js";

const identity = generateIdentity(0);
const KEY = "RRtaDY63M54IdJgpig54Loht3waKd29Y";
const AVATAR = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 13) & 0xff));

let fileServer: FileServer | undefined;
afterEach(async () => {
  await fileServer?.close();
  fileServer = undefined;
});

/** Fake time moves on while real sockets get their turns. */
async function settle<T>(promise: Promise<T>, clock: ManualClock): Promise<T> {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  for (let turn = 0; !done && turn < 4000; turn++) {
    clock.advance(5);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return promise;
}

/** Lets what the server sent cross the simulated link. */
const deliver = (clock: ManualClock) => settle(new Promise((resolve) => setTimeout(resolve, 20)), clock);

type FtReply = (command: ParsedCommand, ok: string) => string[];

async function connected(reply: FtReply, serverOptions: LoopbackServerOptions = {}) {
  const clock = new ManualClock();
  const link = createLink(clock);
  const answer = (command: ParsedCommand) => {
    const ok = `error id=0 msg=ok return_code=${command.rows[0].return_code}`;
    return command.name === "ftinitdownload" ? reply(command, ok) : [];
  };
  const server = createLoopbackServer(link.b, { transport: { clock }, answer, ...serverOptions });
  const connection = new TeamSpeakConnection({
    address: { host: "127.0.0.1", port: 9987 },
    identity,
    nickname: "Loopback Tester",
    transport: { clock },
    testSeams: { deriveServerKey: server.deriveServerKey },
    socketFactory: async () => link.a,
  });
  await settle(connection.connect(), clock);
  const notifications: ConnectionEvent[] = [];
  connection.on("notification", (event) => notifications.push(event));
  return { clock, server, connection, notifications };
}

const startDownload = (command: ParsedCommand, port: number, size = AVATAR.length) =>
  cmd("notifystartdownload", { clientftfid: command.rows[0].clientftfid, serverftfid: 9, ftkey: KEY, port, size, proto: 1 });

const request = { channelId: 0n, path: "/avatar_fimhonahhlkbkaikk" };

describe("downloadFile", () => {
  it("downloads with the ticket after the answer, as TS3 sends it", async () => {
    fileServer = await startFileServer(sendFile(AVATAR, 1000));
    const port = fileServer.port;
    const { clock, connection, server, notifications } = await connected((command, ok) => [ok, startDownload(command, port)]);
    const data = await settle(connection.downloadFile(request, { maxBytes: 256 * 1024 }), clock);
    expect(data.equals(AVATAR)).toBe(true);
    expect(fileServer.keys).toEqual([KEY]);
    expect(server.received.at(-1)).toMatch(
      /^ftinitdownload clientftfid=1 name=\\\/avatar_fimhonahhlkbkaikk cid=0 cpw= seekpos=0 proto=1 return_code=/,
    );
    expect(notifications).toEqual([]);
  });

  it("takes the ticket before the answer, as TS6 sends it, and connects to the given host", async () => {
    fileServer = await startFileServer(sendFile(AVATAR));
    const port = fileServer.port;
    const { clock, connection } = await connected((command, ok) => [startDownload(command, port), ok]);
    const data = await settle(connection.downloadFile(request, { maxBytes: AVATAR.length, host: "127.0.0.1" }), clock);
    expect(data.equals(AVATAR)).toBe(true);
  });

  it("rejects with the server's transfer status", async () => {
    const { clock, connection, notifications } = await connected((command, ok) => [
      cmd("notifystatusfiletransfer", { clientftfid: command.rows[0].clientftfid, status: 2051, msg: "file not found", size: 0 }),
      ok,
    ]);
    const error = await settle(connection.downloadFile(request, { maxBytes: 1000 }), clock).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TeamSpeakServerError);
    expect(error).toMatchObject({ id: 2051, serverMessage: "file not found" });
    expect(notifications).toEqual([]);
  });

  it("refuses an announced size over the limit before connecting", async () => {
    fileServer = await startFileServer(sendFile(AVATAR));
    const port = fileServer.port;
    const { clock, connection } = await connected((command, ok) => [ok, startDownload(command, port)]);
    await expect(settle(connection.downloadFile(request, { maxBytes: 100 }), clock)).rejects.toMatchObject({ code: "tooLarge" });
    expect(fileServer.keys).toEqual([]);
  });

  it("forwards transfer notifications that belong to no download", async () => {
    const { clock, connection, notifications } = await connected((command, ok) => [
      ok,
      cmd("notifystatusfiletransfer", { clientftfid: 77, status: 2065, msg: "file transfer complete", size: 0 }),
    ]);
    await settle(connection.downloadFile(request, { maxBytes: 1000, timeoutMs: 500 }), clock).catch(() => undefined);
    expect(notifications.map((event) => event.type === "notification" && event.command.name)).toEqual(["notifystatusfiletransfer"]);
  });

  it("times out without a ticket and fails when the connection closes", async () => {
    const { clock, connection } = await connected((_command, ok) => [ok]);
    await expect(settle(connection.downloadFile(request, { maxBytes: 1000, timeoutMs: 500 }), clock)).rejects.toMatchObject({
      code: "timeout",
    });
    const waiting = connection.downloadFile(request, { maxBytes: 1000 }).catch((reason: unknown) => reason);
    await settle(connection.disconnect(), clock);
    const error = await waiting;
    expect(error).toBeInstanceOf(TeamSpeakTransportError);
    await expect(connection.downloadFile(request, { maxBytes: 1000 })).rejects.toThrow("not connected");
  });
});

describe("downloadAvatar", () => {
  const UID = Buffer.alloc(20, 0xfb).toString("base64");
  const enter = (clid: number, avatar: string) =>
    cmd("notifycliententerview", {
      cfid: 0,
      ctid: 1,
      reasonid: 0,
      clid,
      client_nickname: "Peer",
      client_unique_identifier: UID,
      client_flag_avatar: avatar,
    });

  it("downloads by the session's UID and avatar flag, without clientinfo", async () => {
    fileServer = await startFileServer(sendFile(AVATAR));
    const port = fileServer.port;
    const { clock, connection, server } = await connected((command, ok) => [ok, startDownload(command, port)]);
    server.handler.sendCommand(Buffer.from(enter(9, "957a5bf1626328596e72a93e8ca010ad")));
    await deliver(clock);
    const avatar = await settle(connection.downloadAvatar(9, { maxBytes: AVATAR.length }), clock);
    expect(avatar?.cacheKey).toBe("957a5bf1626328596e72a93e8ca010ad");
    expect(avatar?.data.equals(AVATAR)).toBe(true);
    expect(server.received.filter((text) => !text.startsWith("ftinitdownload"))).toEqual([]);
    expect(server.received.at(-1)).toContain(`name=\\/avatar_${"pl".repeat(20)} `);
  });

  it("follows a changed avatar flag and has nothing for a client without one", async () => {
    const { clock, connection, server } = await connected(() => []);
    server.handler.sendCommand(Buffer.from(enter(9, "")));
    await deliver(clock);
    expect(await connection.downloadAvatar(9, { maxBytes: 1000 })).toBeUndefined();
    server.handler.sendCommand(Buffer.from(cmd("notifyclientupdated", { clid: 9, client_flag_avatar: "abc" })));
    await deliver(clock);
    expect(connection.session.client(9)?.avatar).toBe("abc");
    expect(server.received).toEqual([]);
  });

  it("refuses clients out of view and works only while connected", async () => {
    const { clock, connection } = await connected(() => []);
    await expect(connection.downloadAvatar(42, { maxBytes: 1000 })).rejects.toThrow("not in view");
    await settle(connection.disconnect(), clock);
    await expect(connection.downloadAvatar(42, { maxBytes: 1000 })).rejects.toThrow("not connected");
  });
});
