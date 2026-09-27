import { ServerError } from "@echosixhiya/teamspeak-client";
import { describe, expect, it } from "vitest";
import { FakeTeamSpeakServer } from "../../test/helpers/fake-ts-client.js";
import { type Gateway, useGateway } from "../../test/helpers/gateway.js";
import { ask, errorOf, joinVoice } from "../../test/helpers/voice.js";

const gateways = useGateway();

const PROTECTED = { id: 4n, name: "Vault", password: "open-sesame" };
const newServer = () => new FakeTeamSpeakServer({ channels: [{ id: 1n, name: "Lobby" }, { id: 2n, name: "Room A" }, { id: 3n, name: "Room B" }, PROTECTED] });

async function alice(gateway: Gateway) {
  return joinVoice(gateway, { nickname: "alice" });
}

describe("switching channels", () => {
  it("moves the session, answers `channelSwitched` with the request id and sends the new tree", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    const answer = await ask(session, "switchChannel", { channelId: "2" }, "sw1");
    expect(answer).toEqual({ type: "channelSwitched", requestId: "sw1", channelId: "2" });
    const list = await session.socket.waitForMessage((message) => message.type === "channelList" && (message.channels as { name: string; members: unknown[] }[]).find((c) => c.name === "Room A")!.members.length === 1);
    expect(list).toBeDefined();
    expect(session.client.getChannelId()).toBe(2n);
  });

  it("treats a switch to the channel the session is already in as done", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    expect(await ask(session, "switchChannel", { channelId: "1" }, "same")).toEqual({ type: "channelSwitched", requestId: "same", channelId: "1" });
  });

  it("refuses a protected channel without its password, and a wrong one, with CHANNEL_PASSWORD_REQUIRED", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    for (const payload of [{ channelId: "4" }, { channelId: "4", password: "wrong" }]) {
      const answer = await ask(session, "switchChannel", payload, "pw");
      expect(answer).toMatchObject({ type: "error", requestId: "pw", error: { code: "CHANNEL_PASSWORD_REQUIRED", recoverable: false } });
    }
    expect(session.client.getChannelId()).toBe(1n);
  });

  it("enters a protected channel with its password", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    expect(await ask(session, "switchChannel", { channelId: "4", password: "open-sesame" }, "pw")).toMatchObject({ type: "channelSwitched", channelId: "4" });
    expect(session.client.getChannelId()).toBe(4n);
  });

  // TeamSpeak answers a switch to a deleted channel with error 768 "invalid channelID", and the
  // gateway's classifier reads "invalid ... channel" as a password problem. Moving another member
  // already answers CHANNEL_NOT_FOUND for the same case, so that is the correct code here too.
  it("F16: a switch to a channel that does not exist answers CHANNEL_NOT_FOUND, not a password request", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    expect(await ask(session, "switchChannel", { channelId: "999" }, "gone")).toMatchObject({ type: "error", requestId: "gone", error: { code: "CHANNEL_NOT_FOUND" } });
    expect(session.client.getChannelId()).toBe(1n);
  });

  it("F16: a channel that the server deleted after the session's tree is answered CHANNEL_NOT_FOUND too (error 768)", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    // The tree still lists the channel, so the request reaches the server, which answers "invalid channelID".
    const stale = (session.client as unknown as { switchChannel: (id: bigint, password?: string) => Promise<void> });
    stale.switchChannel = async () => { throw new ServerError("768", "invalid channelID"); };
    expect(errorOf(await ask(session, "switchChannel", { channelId: "2" }))).toMatchObject({ code: "CHANNEL_NOT_FOUND" });
  });

  it("F16: an error that only says 'invalid channel' is not read as a password problem", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    (session.client as unknown as { switchChannel: () => Promise<void> }).switchChannel = async () => { throw new Error("invalid channel state"); };
    expect(errorOf(await ask(session, "switchChannel", { channelId: "2" }))).toMatchObject({ code: "CHANNEL_SWITCH_FAILED" });
  });
});

describe("moving another member", () => {
  it("moves the member when the session may move clients, and completes the request", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    gateway.ts.adminUids.add(session.client.uid);
    expect(await ask(session, "moveClient", { clientId: bob.id, channelId: "3" }, "mv")).toEqual({ type: "commandCompleted", requestId: "mv" });
    expect(gateway.ts.members.get(bob.id)!.channelID).toBe(3n);
    await session.socket.waitForMessage((message) => message.type === "channelList" && (message.channels as { name: string; members: { nickname: string }[] }[]).find((c) => c.name === "Room B")!.members.some((m) => m.nickname === "bob"));
  });

  it("does not need the target channel's password, because moving is an administrator operation", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    gateway.ts.adminUids.add(session.client.uid);
    expect(await ask(session, "moveClient", { clientId: bob.id, channelId: "4" }, "mv")).toMatchObject({ type: "commandCompleted" });
    expect(gateway.ts.members.get(bob.id)!.channelID).toBe(4n);
  });

  it("reports PERMISSION_DENIED when TeamSpeak refuses a guest, and leaves the member where they are", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    const answer = await ask(session, "moveClient", { clientId: bob.id, channelId: "3" }, "mv");
    expect(answer).toMatchObject({ type: "error", requestId: "mv", error: { code: "PERMISSION_DENIED", recoverable: false } });
    expect(gateway.ts.members.get(bob.id)!.channelID).toBe(2n);
  });

  it("answers from its own directory, without asking TeamSpeak, for yourself, a stranger or a missing channel", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    gateway.ts.adminUids.add(session.client.uid);
    expect(errorOf(await ask(session, "moveClient", { clientId: session.id, channelId: "3" }))).toMatchObject({ code: "CANNOT_MOVE_SELF" });
    expect(errorOf(await ask(session, "moveClient", { clientId: 4242, channelId: "3" }))).toMatchObject({ code: "CLIENT_NOT_FOUND" });
    expect(errorOf(await ask(session, "moveClient", { clientId: bob.id, channelId: "999" }))).toMatchObject({ code: "CHANNEL_NOT_FOUND" });
    expect(gateway.ts.members.get(bob.id)!.channelID).toBe(2n);
  });
});

describe("poke", () => {
  it("pokes a member with the trimmed message and completes the request", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    expect(await ask(session, "poke", { clientId: bob.id, message: "  wake up  " }, "pk")).toEqual({ type: "commandCompleted", requestId: "pk" });
    expect(session.client.pokes).toEqual([{ clientId: bob.id, message: "wake up" }]);
  });

  it("answers CLIENT_NOT_FOUND for a member who is not in the directory", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    expect(errorOf(await ask(session, "poke", { clientId: 4242, message: "hi" }))).toMatchObject({ code: "CLIENT_NOT_FOUND" });
    expect(session.client.pokes).toEqual([]);
  });

  it("forwards a poke from someone else as `pokeReceived` and a server event", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    const after = session.socket.mark();
    bob.poke(session.client, "over here");
    const received = await session.socket.waitForMessage("pokeReceived", { after });
    expect(received).toEqual({ type: "pokeReceived", invokerId: bob.id, invokerUid: "remote-bob", invokerName: "bob", message: "over here", timestamp: expect.any(Number) });
    expect((await session.socket.waitForMessage("serverEvent", { after })).event).toMatchObject({ kind: "poke", message: "bob 戳了你一下", nickname: "bob" });
  });
});

describe("away and mute", () => {
  it("sets the away flag with a trimmed message on the server, and the tree shows it", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    expect(await ask(session, "setAway", { away: true, message: "  lunch  " }, "aw")).toEqual({ type: "commandCompleted", requestId: "aw" });
    expect(gateway.ts.members.get(session.id)).toMatchObject({ away: true, awayMessage: "lunch" });
    await session.socket.waitForMessage((message) => message.type === "channelList" && (message.channels as { members: { away?: boolean }[] }[])[0]!.members[0]?.away === true);
    await ask(session, "setAway", { away: false }, "back");
    expect(gateway.ts.members.get(session.id)).toMatchObject({ away: false, awayMessage: "" });
  });

  it("sets and clears the muted microphone flag on the server", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    await ask(session, "setMicrophoneMuted", { muted: true }, "m1");
    expect(gateway.ts.members.get(session.id)!.inputMuted).toBe(true);
    await ask(session, "setMicrophoneMuted", { muted: false }, "m2");
    expect(gateway.ts.members.get(session.id)!.inputMuted).toBe(false);
  });

  it("maps a TeamSpeak refusal of an operation to its error code, and anything else to OPERATION_FAILED", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    gateway.ts.failNext("setAway", new ServerError("2568", "insufficient client permissions"));
    expect(errorOf(await ask(session, "setAway", { away: true }))).toMatchObject({ code: "PERMISSION_DENIED" });
    gateway.ts.failNext("setAway", new Error("the wire caught fire"));
    expect(errorOf(await ask(session, "setAway", { away: true }))).toMatchObject({ code: "OPERATION_FAILED", message: "操作失败" });
  });
});

describe("latency probe", () => {
  it("asks the server for its version and answers `latencyPong` with the sequence, reachable", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    session.socket.send({ type: "latencyProbe", payload: { sequence: "s1" } });
    const pong = await session.socket.waitForMessage("latencyPong");
    expect(pong).toMatchObject({ sequence: "s1", teamSpeakReachable: true, teamSpeakLatencyMs: expect.any(Number), teamSpeakErrorCode: null });
    expect(session.client.commands).toEqual(["version"]);
  });

  it("reports the server unreachable, with a code, when the command fails", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const session = await alice(gateway);
    gateway.ts.failNext("execCommand", new Error("timed out"));
    session.socket.send({ type: "latencyProbe", payload: { sequence: "s2" } });
    const pong = await session.socket.waitForMessage("latencyPong");
    expect(pong).toMatchObject({ sequence: "s2", teamSpeakReachable: false, teamSpeakLatencyMs: null });
    expect(pong.teamSpeakErrorCode).toEqual(expect.any(String));
  });
});
