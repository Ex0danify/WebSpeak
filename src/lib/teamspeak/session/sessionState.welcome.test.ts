import { describe, expect, it } from "vitest";
import { FIXTURES, hasSessions, loadServerCommands, SESSION_FILES } from "../../../../test/support/tsCaptureFixtures.js";
import { cmd, enter, startSession, WELCOME_CHANNELS } from "../../../../test/support/tsSessionScript.js";
import { CommandTracker } from "../command/commandTracker.js";
import { PacketType } from "../transport/packetTypes.js";
import { parseCommand } from "../wire/commandText.js";
import type { SessionEvent } from "./sessionEvents.js";
import { SessionState } from "./sessionState.js";

const types = (events: SessionEvent[]) => events.map((event) => event.type);

describe("welcome", () => {
  it("completes after the channel list end and our own enter view, TS6 order", () => {
    const { session, feed } = startSession(5);
    for (const text of WELCOME_CHANNELS) expect(feed(text)).toEqual([]);
    expect(session.welcomeComplete).toBe(false);
    expect(types(feed(enter(5, 1, "Me")))).toEqual(["clientEnter", "welcomeComplete"]);
    expect(session.welcomeComplete).toBe(true);
    expect(session.self).toMatchObject({ clientId: 5, channelId: 1n, client: { nickname: "Me" } });
  });

  it("completes with the channel list end when our enter view came first, TS3 order", () => {
    const { session, feed } = startSession(5);
    feed(WELCOME_CHANNELS[0]);
    expect(types(feed(enter(5, 1, "Me")))).toEqual(["clientEnter"]);
    expect(types(feed("channellistfinished"))).toEqual(["welcomeComplete"]);
    expect(types(feed(enter(6, 1, "Other")))).toEqual(["clientEnter"]);
    expect(session.welcomeComplete).toBe(true);
  });

  it("takes our id from aclid only, a client with our nickname is someone else", () => {
    const { session, feed } = startSession(5);
    for (const text of WELCOME_CHANNELS) feed(text);
    // The SDK took the first enter view with a matching nickname for its own.
    expect(types(feed(enter(4, 3, "Me")))).toEqual(["clientEnter"]);
    expect(session.welcomeComplete).toBe(false);
    expect(session.self.client).toBeUndefined();
    feed(enter(5, 1, "Me1"));
    expect(session.self).toMatchObject({ clientId: 5, channelId: 1n });
  });

  it("does not complete before start", () => {
    const session = new SessionState();
    const apply = (text: string) => {
      const command = parseCommand(text);
      return session.apply({ name: command.name!, flags: [], rows: command.rows, low: false });
    };
    apply(enter(0, 1, "nobody"));
    expect(apply("channellistfinished")).toEqual([]);
    expect(session.self.clientId).toBe(0);
    session.start({}, 7);
    expect(() => session.start({}, 7)).toThrow(/already started/);
  });

  it("gives every row of a batched enter view the leading fields", () => {
    const { session, feed } = startSession(5);
    const events = feed(
      cmd(
        "notifycliententerview",
        { cfid: 0, ctid: 3, reasonid: 2, clid: 8, client_nickname: "A", client_servergroups: "6,9" },
        { clid: 5, client_nickname: "Me", client_away: 1, client_away_message: "brb" },
      ),
    );
    expect(events).toMatchObject([
      { type: "clientEnter", client: { id: 8, channelId: 3n, serverGroups: [6, 9] }, reasonId: 2, fromChannelId: 0n },
      { type: "clientEnter", client: { id: 5, channelId: 3n, away: true, awayMessage: "brb" }, reasonId: 2 },
    ]);
    expect(session.client(8)!.properties.ctid).toBeUndefined();
  });

  it("keeps the server properties of initserver", () => {
    const { session } = startSession(5, {
      virtualserver_name: "Home",
      virtualserver_codec_encryption_mode: "2",
      virtualserver_maxclients: "32",
      pv: "8",
    });
    expect(session.server).toMatchObject({ name: "Home", codecEncryptionMode: 2, maxClients: 32 });
    expect(session.server.properties.pv).toBe("8");
  });

  it("gives a snapshot in the gateway's shape", () => {
    const { session, feed } = startSession(5);
    for (const text of WELCOME_CHANNELS) feed(text);
    feed(enter(5, 2, "Me", { client_servergroups: "8", client_input_muted: 1, client_is_channel_commander: 1 }));
    feed(cmd("notifychanneledited", { cid: 2, channel_topic: "Topic" }));
    const snapshot = session.snapshot();
    expect(snapshot.channels).toContainEqual({ id: 2n, parentID: 1n, order: 0n, name: "Talk", description: "Topic" });
    expect(snapshot.clients).toEqual([
      {
        id: 5,
        nickname: "Me",
        uid: "",
        serverGroups: ["8"],
        channelID: 2n,
        type: 0,
        away: false,
        awayMessage: "",
        inputMuted: true,
        outputMuted: false,
        channelCommander: true,
      },
    ]);
    // Plain copies, changing them does not touch the session.
    snapshot.clients[0].serverGroups.push("1");
    expect(session.client(5)!.serverGroups).toEqual([8]);
  });
});

describe.skipIf(!hasSessions)("captured welcomes", () => {
  const expected = {
    [FIXTURES.ts3Session]: {
      selfId: 1,
      clients: [1],
      top: [3n, 4n, 5n, 1n, 7n, 6n, 2n],
      unapplied: ["notifyclientneededpermissions"],
    },
    [FIXTURES.ts6Session]: {
      selfId: 133,
      clients: [129, 133],
      top: [1n, 10n, 11n, 12n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n],
      unapplied: ["notifyclientneededpermissions", "notifyeffectivepermissions"],
    },
  } as const;

  it.each(SESSION_FILES)("replays %s through the tracker", (file) => {
    const [initServer, ...rest] = loadServerCommands(file).filter((text) => !text.startsWith("initiv"));
    const session = new SessionState();
    session.start(parseCommand(initServer).rows[0], expected[file].selfId);
    const events: SessionEvent[] = [];
    // The real path: the tracker drops answers to commands we did not send and hands on the rest.
    const tracker = new CommandTracker(
      { sendCommand: () => undefined },
      { notification: (command) => events.push(...session.apply(command)) },
    );
    for (const text of rest) tracker.receive({ type: PacketType.command, flags: 0, payload: Buffer.from(text) });

    expect(session.welcomeComplete).toBe(true);
    expect(events.findIndex((event) => event.type === "welcomeComplete")).toBeGreaterThan(0);
    expect(session.channels()).toHaveLength(expected[file].top.length);
    expect(session.clients().map((client) => client.id)).toEqual(expected[file].clients);
    expect(session.self.channelId).toBe(1n);
    expect(session.children(0n).map((channel) => channel.id)).toEqual(expected[file].top);
    expect(session.serverGroups.size).toBeGreaterThan(0);
    expect(session.channelGroups.size).toBe(8);
    // channelsubscribeall answered for every channel but our own.
    expect(
      session
        .channels()
        .filter((channel) => !channel.subscribed)
        .map((channel) => channel.id),
    ).toEqual([1n]);
    expect(session.server.name).not.toBe("");
    const unapplied = events.flatMap((event) => (event.type === "notification" ? [event.command.name] : []));
    expect(unapplied).toEqual(expected[file].unapplied);
  });
});
