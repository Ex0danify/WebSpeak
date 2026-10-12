import { describe, expect, it } from "vitest";
import { ServerError } from "@echosixhiya/teamspeak-client";
import { clientConnectionFailureCode, normalizeTeamSpeakError } from "../../src/shared/errors.js";
import type { TSClientOptions } from "../../src/modules/teamspeak/teamSpeakClient.js";
import { FakeTeamSpeakServer, type FakeServerOptions, type FakeTSClient } from "./fakeTsClient.js";

const target = { host: "ts.test", port: 9987 };
const logger = {} as never;

function setup(serverOptions?: FakeServerOptions) {
  const server = new FakeTeamSpeakServer(serverOptions);
  const make = (nickname: string, options: Partial<TSClientOptions> = {}): FakeTSClient =>
    server.createClient({ target, nickname, ...options }, logger) as unknown as FakeTSClient;
  return { server, make };
}

async function failureOf(promise: Promise<unknown>, serverPassword = ""): Promise<string> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, "the call must fail").not.toBeNull();
  return clientConnectionFailureCode(normalizeTeamSpeakError(error), serverPassword);
}

describe("connect", () => {
  it("joins the default channel, assigns a client id and lists the client in the directory", async () => {
    const { server, make } = setup();
    const client = make("alice");
    expect(client.isConnected()).toBe(false);
    expect(client.getClientId()).toBe(0);
    await client.connect();
    expect(client.isConnected()).toBe(true);
    expect(client.getClientId()).toBeGreaterThan(0);
    expect(client.getChannelId()).toBe(1n);
    expect(client.getProtocol()).toBe("ts6");
    expect(server.snapshot().clients.map((member) => member.nickname)).toEqual(["alice"]);
  });

  it("emits clientEnter, then the directory snapshot, then connected, all before connect() resolves", async () => {
    const { make } = setup();
    const client = make("alice");
    const seen: string[] = [];
    for (const name of ["clientEnter", "directorySnapshot", "connected"]) client.on(name, () => seen.push(name));
    const pending = client.connect();
    expect(seen).toEqual([]);
    await pending;
    expect(seen).toEqual(["clientEnter", "directorySnapshot", "connected"]);
  });

  it("withholds the directory snapshot when the server is set to hide it", async () => {
    const { make } = setup({ withholdSnapshot: true });
    const client = make("alice");
    let snapshots = 0;
    client.on("directorySnapshot", () => {
      snapshots++;
    });
    await client.connect();
    expect(snapshots).toBe(0);
  });

  it("joins the channel named by defaultChannel and falls back to the default for an unknown name", async () => {
    const { make } = setup();
    const named = make("alice", { defaultChannel: "Room B" });
    const unknown = make("bob", { defaultChannel: "No such room" });
    await named.connect();
    await unknown.connect();
    expect(named.getChannelId()).toBe(3n);
    expect(unknown.getChannelId()).toBe(1n);
  });

  it("tells clients that are already connected about a newcomer and about a leaver", async () => {
    const { make } = setup();
    const alice = make("alice");
    await alice.connect();
    const events: string[] = [];
    alice.on("clientEnter", (info) => events.push(`enter ${info.nickname}`));
    alice.on("clientLeave", (info) => events.push(`leave ${info.id}`));
    const bob = make("bob");
    await bob.connect();
    const bobId = bob.getClientId();
    await bob.disconnect();
    expect(events).toEqual(["enter bob", `leave ${bobId}`]);
  });

  it("uses the identity it was given, so one identity always has one uid", async () => {
    const { make } = setup();
    const first = make("alice");
    const again = make("alice", { identity: first.identity });
    expect(again.uid).toBe(first.uid);
    expect(again.getIdentityString()).toBe(first.getIdentityString());
    expect(make("bob").uid).not.toBe(first.uid);
  });

  it("stays pending while connects are held and finishes when they are released", async () => {
    const { make, server } = setup();
    const client = make("alice");
    const release = server.holdConnects();
    const pending = client.connect();
    expect(await Promise.race([pending.then(() => "done"), Promise.resolve("pending")])).toBe("pending");
    expect(client.isConnected()).toBe(false);
    release();
    await pending;
    expect(client.isConnected()).toBe(true);
  });

  it("throws an injected failure once and connects on the next attempt", async () => {
    const { make, server } = setup();
    server.failNext("connect", new Error("connection refused"));
    const client = make("alice");
    expect(await failureOf(client.connect())).toBe("CONNECTION_REFUSED");
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });
});

describe("server rules that surface as connection failure codes", () => {
  it("asks for the server password when none is sent, and calls a wrong one invalid", async () => {
    const { make } = setup({ serverPassword: "hunter2" });
    expect(await failureOf(make("alice").connect())).toBe("SERVER_PASSWORD_REQUIRED");
    expect(await failureOf(make("bob", { serverPassword: "wrong" }).connect(), "wrong")).toBe("INVALID_SERVER_PASSWORD");
    const ok = make("carol", { serverPassword: "hunter2" });
    await ok.connect();
    expect(ok.isConnected()).toBe(true);
  });

  it("refuses a protected default channel without its password and accepts it with the password", async () => {
    const { make } = setup({
      channels: [
        { id: 1n, name: "Vault", password: "open" },
        { id: 2n, name: "Lobby" },
      ],
    });
    expect(await failureOf(make("alice", { defaultChannel: "Vault" }).connect())).toBe("CHANNEL_PASSWORD_REQUIRED");
    const ok = make("bob", { defaultChannel: "Vault", channelPassword: "open" });
    await ok.connect();
    expect(ok.getChannelId()).toBe(1n);
  });

  it("refuses a banned identity with BANNED", async () => {
    const { make, server } = setup();
    const alice = make("alice");
    server.bannedUids.add(alice.uid);
    expect(await failureOf(alice.connect())).toBe("BANNED");
    expect(server.members.size).toBe(0);
  });
});

describe("kick, ban and dropped transport", () => {
  it("a kick emits kicked (KICKED, with the reason), then disconnected, and lets the client back in", async () => {
    const { make, server } = setup();
    const alice = make("alice");
    await alice.connect();
    const events: string[] = [];
    alice.on("kicked", (reason) => events.push(`kicked ${clientConnectionFailureCode(reason)} ${reason.diagnostics.serverMessage}`));
    alice.on("disconnected", () => events.push("disconnected"));
    server.kick(alice, "be nice");
    expect(events).toEqual(["kicked KICKED be nice", "disconnected"]);
    expect(alice.isConnected()).toBe(false);
    expect(server.members.size).toBe(0);
    await alice.connect();
    expect(alice.isConnected()).toBe(true);
  });

  it("a ban emits BANNED and keeps the identity out afterwards", async () => {
    const { make, server } = setup();
    const alice = make("alice");
    await alice.connect();
    let code = "";
    alice.on("kicked", (reason) => {
      code = clientConnectionFailureCode(reason);
    });
    server.kick(alice, "", true);
    expect(code).toBe("BANNED");
    expect(await failureOf(alice.connect())).toBe("BANNED");
  });

  it("a dropped transport emits disconnected with the error, and the leaver is announced to others", async () => {
    const { make, server } = setup();
    const alice = make("alice");
    const bob = make("bob");
    await alice.connect();
    await bob.connect();
    const aliceId = alice.getClientId();
    const left: number[] = [];
    bob.on("clientLeave", (info) => left.push(info.id));
    const errors: unknown[] = [];
    alice.on("disconnected", (error) => errors.push(error));
    const cause = new Error("timeout");
    server.drop(alice, cause);
    expect(errors).toEqual([cause]);
    expect(left).toEqual([aliceId]);
    expect(alice.getClientId()).toBe(0);
  });

  it("a reconnect gets a new client id and returns to the channel the client had switched to", async () => {
    const { make, server } = setup();
    const alice = make("alice");
    await alice.connect();
    const firstId = alice.getClientId();
    await alice.switchChannel(3n);
    server.drop(alice);
    await alice.connect();
    expect(alice.getClientId()).not.toBe(firstId);
    expect(alice.getChannelId()).toBe(3n);
  });
});

describe("channel rules", () => {
  it("switches channel, announces the move and rejects a repeat with 'already member'", async () => {
    const { make } = setup();
    const alice = make("alice");
    await alice.connect();
    const moves: bigint[] = [];
    alice.on("clientMoved", (info) => moves.push(info.targetChannelID));
    await alice.switchChannel(2n);
    expect(alice.getChannelId()).toBe(2n);
    expect(moves).toEqual([2n]);
    await expect(alice.switchChannel(2n)).rejects.toThrow(/already member/i);
  });

  it("needs the channel password to switch into a protected channel", async () => {
    const { make } = setup({
      channels: [
        { id: 1n, name: "Lobby" },
        { id: 2n, name: "Vault", password: "open" },
      ],
    });
    const alice = make("alice");
    await alice.connect();
    expect(normalizeTeamSpeakError(await alice.switchChannel(2n).catch((e: unknown) => e)).code).toBe("channel_password_required");
    await expect(alice.switchChannel(2n, "wrong")).rejects.toMatchObject({ id: "781" });
    await alice.switchChannel(2n, "open");
    expect(alice.getChannelId()).toBe(2n);
  });

  it("rejects an unknown channel", async () => {
    const { make } = setup();
    const alice = make("alice");
    await alice.connect();
    await expect(alice.switchChannel(99n)).rejects.toBeInstanceOf(ServerError);
  });
});

describe("move permission", () => {
  it("denies a guest moving another client with a permission error the bridge maps to PERMISSION_DENIED", async () => {
    const { make, server } = setup();
    const guest = make("guest");
    const bob = make("bob");
    await guest.connect();
    await bob.connect();
    const error = await guest.moveClient(bob.getClientId(), 2n).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServerError);
    expect((error as ServerError).id).toBe("2568");
    expect(bob.getChannelId()).toBe(1n);
    expect(server.members.get(bob.getClientId())!.channelID).toBe(1n);
  });

  it("lets an admin move another client, tells the moved client, and ignores the channel password", async () => {
    const { make, server } = setup({
      channels: [
        { id: 1n, name: "Lobby" },
        { id: 2n, name: "Vault", password: "open" },
      ],
    });
    const admin = make("admin");
    const bob = make("bob");
    server.adminUids.add(admin.uid);
    await admin.connect();
    await bob.connect();
    const moves: { id: number; channel: bigint; by: number }[] = [];
    bob.on("clientMoved", (info) => moves.push({ id: info.id, channel: info.targetChannelID, by: info.invokerID }));
    await admin.moveClient(bob.getClientId(), 2n);
    expect(bob.getChannelId()).toBe(2n);
    expect(moves).toEqual([{ id: bob.getClientId(), channel: 2n, by: admin.getClientId() }]);
  });

  it("lets every client move others when guestsCanMove is set", async () => {
    const { make } = setup({ guestsCanMove: true });
    const alice = make("alice");
    const bob = make("bob");
    await alice.connect();
    await bob.connect();
    await alice.moveClient(bob.getClientId(), 2n);
    expect(bob.getChannelId()).toBe(2n);
  });
});
