import { describe, expect, it, vi } from "vitest";
import { ServerError } from "@echosixhiya/teamspeak-client";
import type { TSChatMessage, TSClientOptions, TSVoiceData } from "../../src/server/ts-client.js";
import { FakeTeamSpeakServer, type FakeTSClient } from "./fake-ts-client.js";

const target = { host: "ts.test", port: 9987 };
const logger = {} as never;

function setup() {
  const server = new FakeTeamSpeakServer();
  const join = async (nickname: string, options: Partial<TSClientOptions> = {}): Promise<FakeTSClient> => {
    const client = server.createClient({ target, nickname, ...options }, logger) as unknown as FakeTSClient;
    await client.connect();
    return client;
  };
  return { server, join };
}

function collect<T>(client: FakeTSClient, event: string): T[] {
  const seen: T[] = [];
  client.on(event, (payload: T) => seen.push(payload));
  return seen;
}

const frame = (byte: number) => Buffer.alloc(4, byte);

describe("voice", () => {
  it("delivers a frame to the other clients of the sender's channel only, never back to the sender", async () => {
    const { join } = setup();
    const alice = await join("alice");
    const bob = await join("bob");
    const carol = await join("carol");
    await carol.switchChannel(2n);
    const toAlice = collect<TSVoiceData>(alice, "voiceData");
    const toBob = collect<TSVoiceData>(bob, "voiceData");
    const toCarol = collect<TSVoiceData>(carol, "voiceData");
    alice.sendVoice(frame(7), 4);
    expect(toBob).toEqual([{ clientId: alice.getClientId(), codec: 4, data: frame(7) }]);
    expect(toAlice).toEqual([]);
    expect(toCarol).toEqual([]);
    expect(alice.sentVoice).toEqual([{ data: frame(7), codec: 4 }]);
  });

  it("delivers a whisper only to its targets, wherever they are, and drops the sender and duplicates from the target list", async () => {
    const { join } = setup();
    const alice = await join("alice");
    const bob = await join("bob");
    const carol = await join("carol");
    await bob.switchChannel(2n);
    const toBob = collect<TSVoiceData>(bob, "voiceData");
    const toCarol = collect<TSVoiceData>(carol, "voiceData");
    alice.sendWhisper(frame(1), [bob.getClientId(), bob.getClientId(), alice.getClientId()]);
    expect(alice.sentWhispers).toEqual([{ data: frame(1), clientIds: [bob.getClientId()], codec: 4 }]);
    expect(toBob).toHaveLength(1);
    expect(toCarol).toEqual([]);
    expect(() => alice.sendWhisper(frame(1), [alice.getClientId()])).toThrow("Whisper requires at least one valid target");
  });

  it("ignores voice from a client that is not connected", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    const idle = server.createClient({ target, nickname: "idle" }, logger) as unknown as FakeTSClient;
    const toAlice = collect<TSVoiceData>(alice, "voiceData");
    idle.sendVoice(frame(1));
    expect(idle.sentVoice).toEqual([]);
    expect(toAlice).toEqual([]);
  });

  it("delivers a scripted member's voice to its channel", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    const elsewhere = await join("elsewhere");
    await elsewhere.switchChannel(3n);
    const remote = server.addMember("remote");
    const toAlice = collect<TSVoiceData>(alice, "voiceData");
    const toElsewhere = collect<TSVoiceData>(elsewhere, "voiceData");
    remote.speak(frame(9), 5);
    expect(toAlice).toEqual([{ clientId: remote.id, codec: 5, data: frame(9) }]);
    expect(toElsewhere).toEqual([]);
  });
});

describe("text messages", () => {
  it("scopes channel, server and private messages and never echoes to the sender", async () => {
    const { join } = setup();
    const alice = await join("alice");
    const bob = await join("bob");
    const carol = await join("carol");
    await carol.switchChannel(2n);
    const inbox = { alice: collect<TSChatMessage>(alice, "textMessage"), bob: collect<TSChatMessage>(bob, "textMessage"), carol: collect<TSChatMessage>(carol, "textMessage") };
    await alice.sendTextMessage("channel", "to the channel", alice.getChannelId());
    await alice.sendTextMessage("server", "to everyone");
    await alice.sendTextMessage("private", "psst", BigInt(carol.getClientId()));
    expect(inbox.alice).toEqual([]);
    expect(inbox.bob.map((m) => [m.targetMode, m.message])).toEqual([[2, "to the channel"], [3, "to everyone"]]);
    expect(inbox.carol.map((m) => [m.targetMode, m.message, m.targetId])).toEqual([[3, "to everyone", 0n], [1, "psst", BigInt(carol.getClientId())]]);
    expect(inbox.bob[0]).toMatchObject({ invokerName: "alice", invokerId: alice.getClientId(), invokerUid: alice.uid, targetId: 0n });
    expect(alice.sentMessages.map((m) => m.scope)).toEqual(["channel", "server", "private"]);
  });

  it("delivers a scripted member's message and rejects a private message to an unknown client", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    const remote = server.addMember("remote");
    const inbox = collect<TSChatMessage>(alice, "textMessage");
    remote.say("channel", "hello");
    expect(inbox).toMatchObject([{ invokerName: "remote", message: "hello", targetMode: 2 }]);
    await expect(alice.sendTextMessage("private", "hi", 999n)).rejects.toBeInstanceOf(ServerError);
  });
});

describe("poke, away and mute", () => {
  it("delivers a poke to its target and rejects an unknown target", async () => {
    const { join } = setup();
    const alice = await join("alice");
    const bob = await join("bob");
    const pokes = collect<{ invokerName: string; invokerID: number; message: string }>(bob, "poked");
    await alice.poke(bob.getClientId(), "wake up");
    expect(pokes).toMatchObject([{ invokerName: "alice", invokerID: alice.getClientId(), message: "wake up" }]);
    await expect(alice.poke(999, "x")).rejects.toMatchObject({ id: "512" });
  });

  it("delivers a scripted member's poke", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    const pokes = collect<{ message: string }>(alice, "poked");
    server.addMember("remote").poke(alice, "hey");
    expect(pokes).toMatchObject([{ message: "hey" }]);
  });

  it("publishes away and input-muted changes to everyone as clientUpdated", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    const bob = await join("bob");
    const updates = collect<{ id: number; away?: boolean; awayMessage?: string; inputMuted?: boolean }>(bob, "clientUpdated");
    await alice.setAway(true, "lunch");
    await alice.setInputMuted(true);
    expect(updates).toMatchObject([
      { id: alice.getClientId(), away: true, awayMessage: "lunch" },
      { id: alice.getClientId(), inputMuted: true },
    ]);
    expect(server.members.get(alice.getClientId())).toMatchObject({ away: true, inputMuted: true });
  });
});

describe("scripted members", () => {
  it("appear in the directory and are announced, then move, update and leave", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    const events: string[] = [];
    alice.on("clientEnter", (info) => events.push(`enter ${info.nickname}`));
    alice.on("clientMoved", (info) => events.push(`moved ${info.targetChannelID}`));
    alice.on("clientUpdated", (info) => events.push(`updated ${info.away}`));
    alice.on("clientLeave", (info) => events.push(`leave ${info.id}`));
    const remote = server.addMember("remote", 2n);
    expect(server.snapshot().clients.map((c) => c.nickname)).toEqual(["alice", "remote"]);
    remote.moveTo(3n);
    remote.update({ away: true });
    remote.leave();
    expect(events).toEqual(["enter remote", "moved 3", "updated true", `leave ${remote.id}`]);
    expect(server.snapshot().clients.map((c) => c.nickname)).toEqual(["alice"]);
  });
});

describe("operations outside a session and injected failures", () => {
  it("throw 'not ready' for operations that need a session, and ignore switchChannel like the real client", async () => {
    const { server } = setup();
    const idle = server.createClient({ target, nickname: "idle" }, logger) as unknown as FakeTSClient;
    await expect(idle.sendTextMessage("server", "x")).rejects.toThrow("TeamSpeak session is not ready");
    await expect(idle.poke(1, "x")).rejects.toThrow("TeamSpeak session is not ready");
    await expect(idle.moveClient(1, 1n)).rejects.toThrow("TeamSpeak session is not ready");
    await expect(idle.execCommandWithResponse("version")).rejects.toThrow("TeamSpeak session is not ready");
    await expect(idle.switchChannel(2n)).resolves.toBeUndefined();
    expect(idle.getProtocol()).toBeNull();
  });

  it("fails the named operation the requested number of times, then works", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    server.failNext("sendTextMessage", new Error("flooding"), 2);
    await expect(alice.sendTextMessage("server", "1")).rejects.toThrow("flooding");
    await expect(alice.sendTextMessage("server", "2")).rejects.toThrow("flooding");
    await alice.sendTextMessage("server", "3");
    expect(alice.sentMessages.map((m) => m.message)).toEqual(["3"]);
  });

  it("answers commands through the server hook and records protocol commands", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    server.onCommand = (command) => (command === "version" ? [{ version: "6.0.0" }] : []);
    const seen: string[] = [];
    server.onProtocolCommand = (command) => { seen.push(command); };
    await expect(alice.execCommandWithResponse("version")).resolves.toEqual([{ version: "6.0.0" }]);
    await alice.sendProtocolCommand("requeststreaminfo clid=2");
    expect(alice.commands).toEqual(["version"]);
    expect(alice.protocolCommands).toEqual(["requeststreaminfo clid=2"]);
    expect(seen).toEqual(["requeststreaminfo clid=2"]);
  });

  it("returns a scripted avatar by uid and null for an unknown member or a different uid", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    const remote = server.addMember("remote");
    const avatar = { cacheKey: "abc", data: Buffer.from("png") };
    server.avatars.set(remote.member.uid, avatar);
    await expect(alice.getClientAvatar(remote.id, remote.member.uid)).resolves.toBe(avatar);
    await expect(alice.getClientAvatar(remote.id, "someone-else")).resolves.toBeNull();
    await expect(alice.getClientAvatar(999)).resolves.toBeNull();
    await expect(alice.getClientAvatar(alice.getClientId())).resolves.toBeNull();
  });

  it("holds an async operation for the configured latency", async () => {
    const { server, join } = setup();
    const alice = await join("alice");
    server.latencyMs = 5;
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      const pending = alice.setAway(true).then(done);
      await vi.advanceTimersByTimeAsync(4);
      expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(done).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
