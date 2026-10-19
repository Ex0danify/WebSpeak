import { generateIdentity } from "../../../lib/teamspeak/index.js";
import { describe, expect, it, vi } from "vitest";
import { FakeTeamSpeakServer } from "../../../../test/support/fakeTsClient.js";
import { useGateway } from "../../../../test/support/gateway.js";
import { joinVoice } from "../../../../test/support/voice.js";
import type { JsonMessage } from "../../../../test/support/wsClient.js";

const gateways = useGateway();

type ChannelNode = {
  id: string;
  parentID: string;
  name: string;
  members: { id: number; nickname: string; away?: boolean; awayMessage?: string; inputMuted?: boolean }[];
};

const channelsOf = (message: JsonMessage) => message.channels as ChannelNode[];
const channel = (message: JsonMessage, name: string) => channelsOf(message).find((node) => node.name === name)!;
const memberNames = (message: JsonMessage, name: string) => channel(message, name).members.map((member) => member.nickname);

describe("the initial state", () => {
  it("sends `connected` and then `channelList`, and nothing else first", async () => {
    const gateway = await gateways.start();
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    await socket.waitForMessage("channelList");
    expect(socket.messages.map((message) => message.type)).toEqual(["connected", "channelList"]);
  });

  it("puts the session's own client id, every member and one connection event into `connected`", async () => {
    const ts = new FakeTeamSpeakServer();
    ts.addMember("bob", 2n);
    const gateway = await gateways.start({ ts });
    const { socket, client, id } = await joinVoice(gateway, { nickname: "alice" });
    const connected = socket.messagesOfType("connected")[0]!;
    expect(id).toBe(client.getClientId());
    expect((connected.members as { nickname: string }[]).map((member) => member.nickname).sort()).toEqual(["alice", "bob"]);
    expect(connected.members).toContainEqual(expect.objectContaining({ id, nickname: "alice", uid: client.uid }));
    expect(connected.members).toContainEqual(
      expect.objectContaining({ nickname: "bob", uid: "remote-bob", away: false, inputMuted: false, outputMuted: false }),
    );
    expect(connected.serverEventLog).toEqual([expect.objectContaining({ kind: "connection", message: "Connected to the server" })]);
    expect(connected).toMatchObject({ whisperTargetIds: [], whisperActive: false, webrtcAvailable: false, accelerated: false });
    expect(connected.screenShareIceServers).toEqual(expect.any(Array));
  });

  it("does not reveal the identity unless the ticket asked for it to be remembered", async () => {
    const gateway = await gateways.start();
    const anonymous = await joinVoice(gateway, { nickname: "forgetful" });
    expect(anonymous.socket.messagesOfType("connected")[0]).not.toHaveProperty("identity");
    const remembered = await joinVoice(gateway, { nickname: "keeper", rememberIdentity: true });
    expect(remembered.socket.messagesOfType("connected")[0]!.identity).toBe(remembered.client.getIdentityString());
  });

  it("joins with the identity the ticket carries, so the UID is the same on every visit", async () => {
    const gateway = await gateways.start();
    const identity = generateIdentity(8);
    const first = await joinVoice(gateway, { nickname: "returning", identity: identity.toString(), rememberIdentity: true });
    expect(first.socket.messagesOfType("connected")[0]!.identity).toBe(identity.toString());
    expect(first.client.identity.toString()).toBe(identity.toString());
  });

  it("sends the channel tree with string ids, parents, and each member under their channel", async () => {
    const ts = new FakeTeamSpeakServer({
      channels: [
        { id: 1n, name: "Lobby" },
        { id: 2n, name: "Games" },
        { id: 3n, name: "Chess", parentId: 2n },
      ],
    });
    ts.addMember("bob", 3n);
    const gateway = await gateways.start({ ts });
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    const list = socket.messagesOfType("channelList")[0]!;
    expect(channelsOf(list).map(({ id, parentID, name }) => ({ id, parentID, name }))).toEqual([
      { id: "1", parentID: "0", name: "Lobby" },
      { id: "2", parentID: "0", name: "Games" },
      { id: "3", parentID: "2", name: "Chess" },
    ]);
    expect(memberNames(list, "Lobby")).toEqual(["alice"]);
    expect(memberNames(list, "Chess")).toEqual(["bob"]);
    expect(memberNames(list, "Games")).toEqual([]);
  });

  it("joins the channel named in the ticket, and the default channel when the name is unknown", async () => {
    const gateway = await gateways.start();
    const named = await joinVoice(gateway, { nickname: "in-b", channel: "Room B" });
    expect(memberNames(named.socket.messagesOfType("channelList")[0]!, "Room B")).toEqual(["in-b"]);
    const unknown = await joinVoice(gateway, { nickname: "nowhere", channel: "No such room" });
    expect(memberNames(unknown.socket.messagesOfType("channelList")[0]!, "Lobby")).toEqual(["nowhere"]);
  });
});

describe("members after the initial state", () => {
  it("announces a member who joins with `memberEnter` (not self), a fresh `channelList` and a server event", async () => {
    const gateway = await gateways.start();
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    const after = socket.mark();
    const bob = gateway.ts.addMember("bob", 2n);
    const enter = await socket.waitForMessage("memberEnter", { after });
    expect(enter).toEqual({ type: "memberEnter", id: bob.id, nickname: "bob", uid: "remote-bob", isSelf: false });
    const list = await socket.waitForMessage(
      (message) => message.type === "channelList" && memberNames(message, "Room A").includes("bob"),
      { after },
    );
    expect(memberNames(list, "Lobby")).toEqual(["alice"]);
    const event = await socket.waitForMessage("serverEvent", { after });
    // message is only a fallback, the browser builds its own sentence from kind and nickname.
    expect(event.event).toMatchObject({ kind: "joined", message: "bob joined the server", nickname: "bob", params: { nickname: "bob" } });
  });

  it("announces a member who leaves with `memberLeave`, a fresh `channelList` and a server event", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 2n);
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    const after = socket.mark();
    bob.leave();
    expect(await socket.waitForMessage("memberLeave", { after })).toEqual({ type: "memberLeave", id: bob.id });
    const list = await socket.waitForMessage((message) => message.type === "channelList" && memberNames(message, "Room A").length === 0, {
      after,
    });
    expect(memberNames(list, "Lobby")).toEqual(["alice"]);
    expect((await socket.waitForMessage("serverEvent", { after })).event).toMatchObject({
      kind: "left",
      message: "bob left the server",
      nickname: "bob",
      params: { nickname: "bob" },
    });
  });

  it("moves a member in the tree when they change channel, with a server event", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 2n);
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    const after = socket.mark();
    bob.moveTo(3n);
    const list = await socket.waitForMessage(
      (message) => message.type === "channelList" && memberNames(message, "Room B").includes("bob"),
      { after },
    );
    expect(memberNames(list, "Room A")).toEqual([]);
    expect((await socket.waitForMessage("serverEvent", { after })).event).toMatchObject({
      kind: "moved",
      message: "bob moved to another channel",
      nickname: "bob",
      params: { nickname: "bob" },
    });
  });

  it("carries away and mute flags of other members in the tree", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 2n);
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    const after = socket.mark();
    bob.update({ away: true, awayMessage: "back soon", inputMuted: true });
    const list = await socket.waitForMessage(
      (message) => message.type === "channelList" && channel(message, "Room A").members[0]?.away === true,
      { after },
    );
    expect(channel(list, "Room A").members[0]).toMatchObject({ nickname: "bob", away: true, awayMessage: "back soon", inputMuted: true });
  });

  it("sends a member's avatar as a data URL once it has been fetched, and nothing for one that is not an image", async () => {
    const gateway = await gateways.start();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("pixels")]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("pixels")]);
    gateway.ts.avatars.set("remote-carol", { cacheKey: "k1", data: Buffer.from("not an image") });
    gateway.ts.avatars.set("remote-bob", { cacheKey: "k2", data: png });
    gateway.ts.avatars.set("remote-dave", { cacheKey: "k3", data: jpeg });
    // Avatars are fetched one member after another in id order, so once bob's and dave's have
    // arrived, carol's lookup (first in line) is done and has produced nothing.
    gateway.ts.addMember("carol", 2n);
    const bob = gateway.ts.addMember("bob", 2n);
    const dave = gateway.ts.addMember("dave", 2n);
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    await socket.waitForMessage((message) => message.type === "memberAvatar" && message.id === dave.id);
    expect(socket.messagesOfType("memberAvatar")).toEqual([
      { type: "memberAvatar", id: bob.id, uid: "remote-bob", avatar: `data:image/png;base64,${png.toString("base64")}` },
      { type: "memberAvatar", id: dave.id, uid: "remote-dave", avatar: `data:image/jpeg;base64,${jpeg.toString("base64")}` },
    ]);
  });
});

describe("the handshake", () => {
  it("applies a member who entered before the snapshot on top of it (handlers exist before connect)", async () => {
    const gateway = await gateways.start({ ts: new FakeTeamSpeakServer({ withholdSnapshot: true }) });
    gateway.ts.addMember("bob", 2n);
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    const client = await vi.waitFor(() => {
      const created = gateway.ts.created[0];
      if (!created?.isConnected()) throw new Error("the fake client is not connected yet");
      return created;
    });
    client.emit("clientEnter", { nickname: "carol", uid: "remote-carol", serverGroups: [], channelID: 3n, type: 0, id: 99 });
    client.emit("directorySnapshot", gateway.ts.snapshot());
    const connected = await socket.waitForMessage("connected");
    expect((connected.members as { nickname: string }[]).map((member) => member.nickname).sort()).toEqual(["alice", "bob", "carol"]);
  });

  it("a snapshot that arrives in time completes the join, and commands answer SESSION_NOT_READY until it does", async () => {
    const gateway = await gateways.start({ ts: new FakeTeamSpeakServer({ withholdSnapshot: true }) });
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    const client = await vi.waitFor(() => {
      const created = gateway.ts.created[0];
      if (!created?.isConnected()) throw new Error("the fake client is not connected yet");
      return created;
    });
    socket.send({ type: "poke", requestId: "early", payload: { clientId: 1, message: "hi" } });
    const refusal = await socket.waitForMessage("error");
    expect(refusal).toMatchObject({ error: { code: "SESSION_NOT_READY", recoverable: false } });
    expect(socket.messagesOfType("connected")).toEqual([]);
    client.emit("directorySnapshot", gateway.ts.snapshot());
    await socket.waitForMessage("connected");
    await socket.waitForMessage("channelList");
  });

  it("without a directory snapshot the session fails with TIMEOUT after the bounded wait and is closed", async () => {
    const gateway = await gateways.start({
      ts: new FakeTeamSpeakServer({ withholdSnapshot: true }),
      voiceBridgeOptions: { directorySyncTimeoutMs: 100 },
    });
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    const failure = await socket.waitForMessage("connectionFailed");
    expect(failure).toMatchObject({ code: "TIMEOUT" });
    expect(await socket.waitForClose()).toEqual({ code: 4003, reason: "TIMEOUT" });
    expect(socket.messagesOfType("connected")).toEqual([]);
    const admin = await gateway.adminLogin();
    await vi.waitFor(async () => expect(((await (await admin.get("sessions")).json()) as { sessions: unknown[] }).sessions).toEqual([]));
    expect(gateway.ts.created[0]!.isConnected()).toBe(false);
  });
});
