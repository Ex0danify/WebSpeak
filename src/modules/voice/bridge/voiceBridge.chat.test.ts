import { describe, expect, it } from "vitest";
import { type Gateway, useGateway } from "../../../../test/helpers/gateway.js";
import { ask, errorOf, joinVoice, type VoiceSession } from "../../../../test/helpers/voice.js";
import type { JsonMessage } from "../../../../test/helpers/wsClient.js";

const gateways = useGateway();

/** Sends a whisper command and returns the `whisperTargets` state the gateway reports, which has no request id. */
async function whisper(session: VoiceSession, type: "setWhisperTargets" | "setWhisperActive", payload: Record<string, unknown>): Promise<JsonMessage> {
  const after = session.socket.mark();
  session.socket.send({ type, payload });
  return session.socket.waitForMessage("whisperTargets", { after });
}

const alice = (gateway: Gateway) => joinVoice(gateway, { nickname: "alice" });

describe("sending chat", () => {
  it("sends a channel message to the session's current channel, trimmed", async () => {
    const gateway = await gateways.start();
    const session = await alice(gateway);
    expect(await ask(session, "sendTextMessage", { message: "  hello room  " }, "c1")).toEqual({ type: "commandCompleted", requestId: "c1" });
    expect(session.client.sentMessages).toEqual([{ scope: "channel", message: "hello room", targetId: 1n }]);
    await ask(session, "switchChannel", { channelId: "3" });
    await ask(session, "sendTextMessage", { message: "moved" });
    expect(session.client.sentMessages.at(-1)).toEqual({ scope: "channel", message: "moved", targetId: 3n });
  });

  it("sends a server message and a private message to a member", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    await ask(session, "sendServerMessage", { message: "hi all" });
    await ask(session, "sendPrivateMessage", { clientId: bob.id, message: "psst" });
    expect(session.client.sentMessages).toEqual([
      { scope: "server", message: "hi all", targetId: 0n },
      { scope: "private", message: "psst", targetId: BigInt(bob.id) },
    ]);
  });

  it("completes a blank message without sending anything", async () => {
    const gateway = await gateways.start();
    const session = await alice(gateway);
    expect(await ask(session, "sendTextMessage", { message: "   " }, "blank")).toEqual({ type: "commandCompleted", requestId: "blank" });
    expect(await ask(session, "sendServerMessage", { message: "" }, "blank2")).toEqual({ type: "commandCompleted", requestId: "blank2" });
    expect(session.client.sentMessages).toEqual([]);
  });

  it("answers CLIENT_NOT_FOUND for a private message to someone who is not in the directory", async () => {
    const gateway = await gateways.start();
    const session = await alice(gateway);
    expect(errorOf(await ask(session, "sendPrivateMessage", { clientId: 4242, message: "hello?" }))).toMatchObject({ code: "CLIENT_NOT_FOUND" });
    expect(session.client.sentMessages).toEqual([]);
  });

  it("reaches the other member's session as a channel message from alice, and not the one in another channel", async () => {
    const gateway = await gateways.start();
    const sender = await alice(gateway);
    const near = await joinVoice(gateway, { nickname: "near" });
    const far = await joinVoice(gateway, { nickname: "far", channel: "Room B" });
    const after = near.socket.mark();
    const farAfter = far.socket.mark();
    await ask(sender, "sendTextMessage", { message: "to the lobby" });
    const received = await near.socket.waitForMessage("chatMessage", { after });
    expect(received).toMatchObject({ scope: "channel", targetId: "1", senderUid: sender.client.uid, invokerName: "alice", invokerId: sender.id, message: "to the lobby" });
    // The message was delivered before alice's request completed. A reply to a probe on the far
    // session's own socket comes after anything sent to it earlier, so if a message had been
    // routed there it would already be recorded.
    far.socket.send({ type: "latencyProbe", payload: { sequence: "barrier" } });
    await far.socket.waitForMessage("latencyPong", { after: farAfter });
    expect(far.socket.frames.slice(farAfter).filter((frame) => frame.kind === "json" && frame.message.type === "chatMessage")).toEqual([]);
  });
});

describe("receiving chat", () => {
  it("shows a channel message bound to the session's current channel, as a string id", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 1n);
    const session = await alice(gateway);
    const after = session.socket.mark();
    bob.say("channel", "hello lobby");
    expect(await session.socket.waitForMessage("chatMessage", { after })).toEqual({
      type: "chatMessage", scope: "channel", targetId: "1", senderUid: "remote-bob", timestamp: expect.any(Number), invokerName: "bob", invokerId: bob.id, message: "hello lobby",
    });
  });

  it("shows a server message without a target", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 3n);
    const session = await alice(gateway);
    const after = session.socket.mark();
    bob.say("server", "announcement");
    const message = await session.socket.waitForMessage("chatMessage", { after });
    expect(message).toMatchObject({ scope: "server", invokerName: "bob", message: "announcement" });
    expect(message).not.toHaveProperty("targetId");
  });

  it("shows a private message with the session's own client id as the target", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 3n);
    const session = await alice(gateway);
    const after = session.socket.mark();
    bob.say("private", "just for you", BigInt(session.id));
    expect(await session.socket.waitForMessage("chatMessage", { after })).toMatchObject({ scope: "private", targetId: String(session.id), message: "just for you" });
  });
});

describe("whisper targets", () => {
  it("keeps the list, sorted out of the directory, and reports it with the active flag", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 2n);
    const carol = gateway.ts.addMember("carol", 3n);
    const session = await alice(gateway);
    expect(await whisper(session, "setWhisperTargets", { targetIds: [carol.id, bob.id] })).toEqual({ type: "whisperTargets", targetIds: [carol.id, bob.id], active: false });
    expect(await whisper(session, "setWhisperActive", { active: true })).toEqual({ type: "whisperTargets", targetIds: [carol.id, bob.id], active: true });
    expect(await whisper(session, "setWhisperActive", { active: false })).toMatchObject({ active: false });
  });

  it("refuses to switch whispering on without targets, with NO_WHISPER_TARGETS", async () => {
    const gateway = await gateways.start();
    const session = await alice(gateway);
    expect(errorOf(await ask(session, "setWhisperActive", { active: true }))).toMatchObject({ code: "NO_WHISPER_TARGETS" });
  });

  it("refuses targets that are yourself or not in the directory, and keeps the old list", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    await whisper(session, "setWhisperTargets", { targetIds: [bob.id] });
    expect(errorOf(await ask(session, "setWhisperTargets", { targetIds: [session.id] }))).toMatchObject({ code: "CLIENT_NOT_FOUND" });
    expect(errorOf(await ask(session, "setWhisperTargets", { targetIds: [bob.id, 4242] }))).toMatchObject({ code: "CLIENT_NOT_FOUND" });
    expect(await whisper(session, "setWhisperActive", { active: true })).toMatchObject({ targetIds: [bob.id], active: true });
  });

  it("clearing the list switches whispering off", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    await whisper(session, "setWhisperTargets", { targetIds: [bob.id] });
    await whisper(session, "setWhisperActive", { active: true });
    expect(await whisper(session, "setWhisperTargets", { targetIds: [] })).toEqual({ type: "whisperTargets", targetIds: [], active: false });
  });

  it("drops a target who leaves the server, tells the browser, and switches whispering off with the last one", async () => {
    const gateway = await gateways.start();
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await alice(gateway);
    await whisper(session, "setWhisperTargets", { targetIds: [bob.id] });
    await whisper(session, "setWhisperActive", { active: true });
    const after = session.socket.mark();
    bob.leave();
    expect(await session.socket.waitForMessage("whisperTargets", { after })).toEqual({ type: "whisperTargets", targetIds: [], active: false });
  });
});
