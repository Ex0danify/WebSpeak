import { createHash } from "node:crypto";
import { generateIdentity, TeamSpeakServerError } from "../../../lib/teamspeak/index.js";
import { describe, expect, it, vi } from "vitest";
import { FakeTeamSpeakServer } from "../../../../test/support/fakeTsClient.js";
import { type Gateway, useGateway } from "../../../../test/support/gateway.js";
import { joinVoice } from "../../../../test/support/voice.js";
import { MAX_ACTIVE_SESSIONS } from "../../../shared/constants.js";
import type { JoinTicketPayload } from "../../join/joinTicket.js";

const gateways = useGateway();

/** Joins with a ticket that is expected to fail, and returns everything the browser saw. */
async function failedJoin(gateway: Gateway, payload: Partial<JoinTicketPayload> = {}) {
  const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice", ...payload }));
  const closed = await socket.waitForClose();
  return { messages: socket.messages, closed };
}

describe("a join that TeamSpeak refuses", () => {
  const vault = { id: 4n, name: "Vault", password: "open-sesame" };
  const guarded = () => new FakeTeamSpeakServer({ serverPassword: "sekret", channels: [{ id: 1n, name: "Lobby" }, vault] });

  it("names the failure in `connectionFailed` before closing with 4003 and the same code as the reason", async () => {
    const gateway = await gateways.start({ ts: guarded() });
    const { messages, closed } = await failedJoin(gateway);
    expect(messages).toEqual([expect.objectContaining({ type: "connectionFailed", code: "SERVER_PASSWORD_REQUIRED" })]);
    expect(closed).toEqual({ code: 4003, reason: "SERVER_PASSWORD_REQUIRED" });
  });

  it("tells a missing server password from a wrong one by whether the ticket carried one", async () => {
    const gateway = await gateways.start({ ts: guarded() });
    expect((await failedJoin(gateway, { serverPassword: "" })).messages[0]).toMatchObject({ code: "SERVER_PASSWORD_REQUIRED" });
    expect((await failedJoin(gateway, { serverPassword: "wrong" })).messages[0]).toMatchObject({ code: "INVALID_SERVER_PASSWORD" });
  });

  it("reports a protected channel that was asked for by name as CHANNEL_PASSWORD_REQUIRED", async () => {
    const gateway = await gateways.start({ ts: guarded() });
    const { messages, closed } = await failedJoin(gateway, { serverPassword: "sekret", channel: "Vault" });
    expect(messages[0]).toMatchObject({ type: "connectionFailed", code: "CHANNEL_PASSWORD_REQUIRED" });
    expect(closed.reason).toBe("CHANNEL_PASSWORD_REQUIRED");
  });

  it("reports a banned identity as BANNED", async () => {
    const gateway = await gateways.start();
    const identity = generateIdentity(8);
    gateway.ts.bannedUids.add(createHash("sha1").update(identity.publicKeyBase64).digest("base64"));
    const { messages, closed } = await failedJoin(gateway, { identity: identity.toString() });
    expect(messages[0]).toMatchObject({ type: "connectionFailed", code: "BANNED" });
    expect(closed).toEqual({ code: 4003, reason: "BANNED" });
  });

  it.each([
    {
      what: "a nickname that is taken",
      error: new TeamSpeakServerError({ id: 513, serverMessage: "nickname is already in use" }),
      code: "NICKNAME_IN_USE",
    },
    { what: "a full server", error: new TeamSpeakServerError({ id: 1796, serverMessage: "server is full" }), code: "SERVER_FULL" },
    {
      what: "a host that does not resolve",
      error: Object.assign(new Error("getaddrinfo ENOTFOUND ts.test"), { code: "ENOTFOUND" }),
      code: "HOST_NOT_FOUND",
    },
    {
      what: "a refused connection",
      error: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9987"), { code: "ECONNREFUSED" }),
      code: "CONNECTION_REFUSED",
    },
    { what: "a timeout", error: new Error("connection timed out"), code: "TIMEOUT" },
    { what: "something unrecognized", error: new Error("the wire caught fire"), code: "CONNECTION_FAILED" },
  ])("maps $what to $code on its way to the browser", async ({ error, code }) => {
    const gateway = await gateways.start();
    gateway.ts.failNext("connect", error);
    const { messages, closed } = await failedJoin(gateway);
    expect(messages).toEqual([expect.objectContaining({ type: "connectionFailed", code })]);
    expect(closed).toEqual({ code: 4003, reason: code });
  });

  it("ends the session, so the admin console lists none", async () => {
    const gateway = await gateways.start({ ts: guarded() });
    await failedJoin(gateway);
    const admin = await gateway.adminLogin();
    await vi.waitFor(async () => expect((await (await admin.get("sessions")).json()).sessions).toEqual([]));
  });
});

describe("a join the gateway refuses before TeamSpeak", () => {
  it("closes with 4003 and IDENTITY_INVALID, after a `connectionFailed`, for an identity that cannot be read", async () => {
    const gateway = await gateways.start();
    // A ticket the store would never issue (the join-ticket route drops a corrupt identity), planted directly.
    const { messages, closed } = await failedJoin(gateway, { identity: "not an identity" });
    expect(messages).toEqual([{ type: "connectionFailed", code: "IDENTITY_INVALID", detail: "Invalid identity" }]);
    expect(closed).toEqual({ code: 4003, reason: "IDENTITY_INVALID" });
    expect(gateway.ts.created).toEqual([]);
  });

  it("closes with 4003 and TEAM_SPEAK_CLIENT_UNAVAILABLE when the client cannot even be created", async () => {
    class BrokenServer extends FakeTeamSpeakServer {
      override readonly createClient = () => {
        throw new Error("no native library");
      };
    }
    const gateway = await gateways.start({ ts: new BrokenServer() });
    const { messages, closed } = await failedJoin(gateway);
    expect(messages).toEqual([{ type: "connectionFailed", code: "TEAM_SPEAK_CLIENT_UNAVAILABLE", detail: "TeamSpeak client unavailable" }]);
    expect(closed).toEqual({ code: 4003, reason: "TEAM_SPEAK_CLIENT_UNAVAILABLE" });
  });

  describe("when the client cannot be created", () => {
    class BrokenServer extends FakeTeamSpeakServer {
      override readonly createClient = () => {
        throw new Error("no native library");
      };
    }
    const activeSessions = async (gateway: Gateway) => {
      const admin = await gateway.adminLogin();
      return (await (await admin.get("overview")).json()).sessions.active as number;
    };

    it("keeps no session behind", async () => {
      const gateway = await gateways.start({ ts: new BrokenServer() });
      await failedJoin(gateway);
      expect(await activeSessions(gateway)).toBe(0);
    });

    it("still admits a join after MAX_ACTIVE_SESSIONS such failures", async () => {
      const gateway = await gateways.start({ ts: new BrokenServer() });
      for (let i = 0; i < MAX_ACTIVE_SESSIONS; i++) await failedJoin(gateway, { nickname: `n${i}` });
      const { closed } = await failedJoin(gateway, { nickname: "last" });
      expect(closed.code).toBe(4003);
    }, 60_000);
  });

  it("closes the second session that uses the same identity on the same server with 4005 and no message, and leaves the first alone", async () => {
    const gateway = await gateways.start();
    const identity = generateIdentity(8).toString();
    const first = await joinVoice(gateway, { nickname: "first", identity });
    const { messages, closed } = await failedJoin(gateway, { nickname: "second", identity });
    expect(messages).toEqual([]);
    expect(closed).toEqual({ code: 4005, reason: "IDENTITY_IN_USE" });
    expect(gateway.ts.created.map((client) => client.options.nickname)).toEqual(["first"]);
    expect(first.socket.closeInfo).toBeNull();
    expect(first.client.isConnected()).toBe(true);
  });

  it("allows the same identity on another server, and a different identity on the same one", async () => {
    const gateway = await gateways.start();
    const identity = generateIdentity(8).toString();
    await joinVoice(gateway, { nickname: "one", identity });
    await joinVoice(gateway, { nickname: "elsewhere", identity, target: { host: "other.test", port: 9987 } });
    await joinVoice(gateway, { nickname: "other", identity: generateIdentity(8).toString() });
  });
});

describe("a session that TeamSpeak ends", () => {
  it.each([
    { what: "kick", ban: false, code: "KICKED", detail: "server error id=4" },
    { what: "ban", ban: true, code: "BANNED", detail: "server error id=5" },
  ])(
    "replays the reason of a $what as `connectionFailed` $code, then closes with 1000 and does not reconnect",
    async ({ ban, code, detail }) => {
      const gateway = await gateways.start();
      const { socket, client } = await joinVoice(gateway, { nickname: "alice" });
      gateway.ts.kick(client, "Slow down!", ban);
      const failed = await socket.waitForMessage("connectionFailed");
      expect(failed).toMatchObject({ code, detail: expect.stringContaining("Slow down!") });
      expect(failed.detail).toContain(detail);
      expect(await socket.waitForClose()).toEqual({ code: 1000, reason: "teamSpeak-kicked" });
      expect(socket.messagesOfType("reconnecting")).toEqual([]);
    },
  );

  it("tells the browser the connection dropped and that it will try again, after the first delay of about a second", async () => {
    const gateway = await gateways.start();
    const { socket, client } = await joinVoice(gateway, { nickname: "alice" });
    const after = socket.mark();
    gateway.ts.drop(client, new Error("read ECONNRESET"));
    expect(await socket.waitForMessage("disconnected", { after })).toEqual({ type: "disconnected", recoverable: true });
    const reconnecting = await socket.waitForMessage("reconnecting", { after });
    expect(reconnecting).toMatchObject({ attempt: 1 });
    expect(reconnecting.delayMs as number).toBeGreaterThanOrEqual(900);
    expect(reconnecting.delayMs as number).toBeLessThanOrEqual(1100);
  });

  it("comes back with a fresh `connected`, `channelList` and `reconnected` with a new client id after the delay", async () => {
    const gateway = await gateways.start();
    const { socket, client, id } = await joinVoice(gateway, { nickname: "alice", channel: "Room B" });
    const after = socket.mark();
    gateway.ts.drop(client);
    // The wait is the product's own reconnect timer (1 s, minus up to 10% jitter).
    const connected = await socket.waitForMessage("connected", { after, timeoutMs: 5000 });
    expect(connected.tsClientId).not.toBe(id);
    await socket.waitForMessage("reconnected", { after });
    const list = socket.messagesOfType("channelList").at(-1)!;
    expect(
      (list.channels as { name: string; members: { nickname: string }[] }[])
        .find((c) => c.name === "Room B")!
        .members.map((m) => m.nickname),
    ).toEqual(["alice"]);
  });
});
