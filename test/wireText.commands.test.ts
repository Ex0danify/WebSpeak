// The wire text the gateway sends, pinned row by row (command errors and server events). The
// message column is English and for logs only, optional fields ride beside it. Expected text uses escapes
// so the files stay free of CJK characters.
import { ServerError } from "@echosixhiya/teamspeak-client";
import { describe, expect, it, vi } from "vitest";
import { FakeTeamSpeakServer } from "./support/fakeTsClient.js";
import { useGateway } from "./support/gateway.js";
import { joinVoice } from "./support/voice.js";
import { mapChannelTree } from "../src/modules/voice/directory/voiceDirectoryView.js";
import { handleCommand } from "../src/modules/voice/messages/voiceCommands.js";
import type { ClientCommand } from "../src/modules/voice/messages/voiceProtocol.js";
import type { WebClientEntry } from "../src/modules/voice/voiceTypes.js";

describe("command errors (voiceCommands)", () => {
  function entryWith(overrides: { switchChannel?: () => Promise<void>; moveClient?: () => Promise<void> } = {}) {
    return {
      channelTree: [{ id: "2", name: "Room" }],
      members: new Map([[7, {}]]),
      whisperTargetIds: new Set<number>(),
      whisperActive: false,
      lastLatencyProbeAt: 0,
      webrtc: null,
      tsClient: {
        getClientId: () => 1,
        getChannelId: () => 1n,
        switchChannel: overrides.switchChannel ?? (async () => undefined),
        moveClient: overrides.moveClient ?? (async () => undefined),
        sendTextMessage: async () => undefined,
        poke: async () => undefined,
      },
    } as unknown as WebClientEntry;
  }
  const run = async (entry: WebClientEntry, type: ClientCommand["type"], payload: Record<string, unknown>) => {
    const sendJson = vi.fn();
    await handleCommand(entry, { type, requestId: "r", payload }, sendJson);
    return sendJson.mock.calls.map((call) => call[0]);
  };
  const failure = (code: string, message: string) => [{ type: "error", requestId: "r", error: { code, message, recoverable: false } }];

  // [what, command, payload, code, message]
  const rows: [string, ClientCommand["type"], Record<string, unknown>, string, string][] = [
    [
      "switch to a channel that is not in the tree",
      "switchChannel",
      { channelId: "9" },
      "CHANNEL_NOT_FOUND",
      "Target channel is unavailable",
    ],
    ["move the session's own client", "moveClient", { clientId: 1, channelId: "2" }, "CANNOT_MOVE_SELF", "You cannot move your own client"],
    [
      "move a client that is not visible",
      "moveClient",
      { clientId: 99, channelId: "2" },
      "CLIENT_NOT_FOUND",
      "Client is offline or not visible",
    ],
    [
      "move to a channel that is not in the tree",
      "moveClient",
      { clientId: 7, channelId: "9" },
      "CHANNEL_NOT_FOUND",
      "Target channel is unavailable",
    ],
    [
      "private message to a client that left",
      "sendPrivateMessage",
      { clientId: 99, message: "hi" },
      "CLIENT_NOT_FOUND",
      "Client is offline or not visible",
    ],
    ["poke a client that left", "poke", { clientId: 99, message: "hi" }, "CLIENT_NOT_FOUND", "Client is offline or not visible"],
    ["whisper to a client that left", "setWhisperTargets", { targetIds: [99] }, "CLIENT_NOT_FOUND", "Client is offline or not visible"],
    ["whisper to oneself", "setWhisperTargets", { targetIds: [1] }, "CLIENT_NOT_FOUND", "Client is offline or not visible"],
    ["activate whispering without targets", "setWhisperActive", { active: true }, "NO_WHISPER_TARGETS", "Select whisper targets first"],
  ];

  it.each(rows)("%s", async (_what, type, payload, code, message) => {
    expect(await run(entryWith(), type, payload)).toEqual(failure(code, message));
  });

  it("a failing switch answers the classified code, or CHANNEL_SWITCH_FAILED", async () => {
    const full = entryWith({
      switchChannel: async () => {
        throw new ServerError("515", "server is full");
      },
    });
    expect(await run(full, "switchChannel", { channelId: "2" })).toEqual(failure("CHANNEL_FULL", "This channel is full"));
    const odd = entryWith({
      switchChannel: async () => {
        throw new Error("something odd");
      },
    });
    expect(await run(odd, "switchChannel", { channelId: "2" })).toEqual(failure("CHANNEL_SWITCH_FAILED", "Channel switch failed"));
  });

  it("any other failing command answers the classified code, or OPERATION_FAILED", async () => {
    const denied = entryWith({
      moveClient: async () => {
        throw new ServerError("2568", "insufficient client permissions");
      },
    });
    expect(await run(denied, "moveClient", { clientId: 7, channelId: "2" })).toEqual(
      failure("PERMISSION_DENIED", "You do not have permission to do this"),
    );
    const odd = entryWith({
      moveClient: async () => {
        throw new Error("something odd");
      },
    });
    expect(await run(odd, "moveClient", { clientId: 7, channelId: "2" })).toEqual(failure("OPERATION_FAILED", "Operation failed"));
  });
});

describe("names the gateway fills in (voiceDirectoryView)", () => {
  it("an unnamed channel and a nameless client", () => {
    const tree = mapChannelTree({
      channels: [{ id: 1n, parentID: 0n, order: 0n, name: "", description: "" }],
      clients: [
        {
          id: 5,
          channelID: 1n,
          nickname: "",
          uid: "",
          away: false,
          awayMessage: "",
          inputMuted: false,
          outputMuted: false,
          channelCommander: false,
        },
      ],
    } as never) as { name: string; unnamed?: boolean; members: { nickname: string; unnamed?: boolean }[] }[];
    expect(tree[0].name).toBe("");
    expect(tree[0].members[0].nickname).toBe("");
    expect([tree[0].unnamed, tree[0].members[0].unnamed]).toEqual([true, true]);
  });
});

describe("server events as the browser receives them", () => {
  const gateways = useGateway();
  const newServer = () =>
    new FakeTeamSpeakServer({
      channels: [
        { id: 1n, name: "Lobby" },
        { id: 2n, name: "Room A" },
      ],
    });
  const eventOf = (message: Record<string, unknown>) =>
    message.event as { kind: string; message: string; nickname?: string; channelName?: string };

  it("the first event in the log of a new session is the connection", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await joinVoice(gateway, { nickname: "alice" });
    const connected = session.socket.messagesOfType("connected")[0] as unknown as { serverEventLog: unknown[] };
    expect(connected.serverEventLog).toEqual([
      { id: expect.stringMatching(/-connected$/), kind: "connection", message: "Connected to the server", timestamp: expect.any(Number) },
    ]);
  });

  it("joined, moved and left", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await joinVoice(gateway, { nickname: "alice" });
    const after = session.socket.mark();
    const bob = gateway.ts.addMember("bob");
    gateway.ts.moveMember(bob.id, 2n);
    gateway.ts.removeMember(bob.id);
    await session.socket.waitForMessage((message) => message.type === "serverEvent" && eventOf(message).kind === "left", { after });
    const events = session.socket.messages
      .slice(after)
      .filter((message) => message.type === "serverEvent")
      .map(eventOf);
    expect(events.map(({ kind, message, nickname }) => ({ kind, message, nickname }))).toEqual([
      { kind: "joined", message: "bob joined the server", nickname: "bob" },
      { kind: "moved", message: "bob moved to another channel", nickname: "bob" },
      { kind: "left", message: "bob left the server", nickname: "bob" },
    ]);
  });

  it("a channel created, renamed and deleted", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await joinVoice(gateway, { nickname: "alice" });
    const after = session.socket.mark();
    const publish = () => session.client.emit("directorySnapshot", gateway.ts.snapshot());
    gateway.ts.channels.set(3n, { id: 3n, name: "Fresh" });
    publish();
    gateway.ts.channels.get(3n)!.name = "Renamed";
    publish();
    gateway.ts.channels.delete(3n);
    publish();
    await session.socket.waitForMessage((message) => message.type === "serverEvent" && eventOf(message).kind === "channelDeleted", {
      after,
    });
    const events = session.socket.messages
      .slice(after)
      .filter((message) => message.type === "serverEvent")
      .map(eventOf);
    expect(events.map(({ kind, message, channelName }) => ({ kind, message, channelName }))).toEqual([
      { kind: "channelCreated", message: 'Channel "Fresh" was created', channelName: "Fresh" },
      { kind: "channelRenamed", message: 'Channel was renamed to "Renamed"', channelName: "Renamed" },
      { kind: "channelDeleted", message: 'Channel "Renamed" was deleted', channelName: "Renamed" },
    ]);
  });

  it("a poke", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const bob = gateway.ts.addMember("bob");
    const session = await joinVoice(gateway, { nickname: "alice" });
    const after = session.socket.mark();
    bob.poke(session.client, "over here");
    expect(eventOf(await session.socket.waitForMessage("serverEvent", { after }))).toMatchObject({
      kind: "poke",
      message: "bob poked you",
      nickname: "bob",
    });
  });
});
