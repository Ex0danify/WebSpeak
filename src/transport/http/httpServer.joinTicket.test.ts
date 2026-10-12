import { generateIdentity } from "@echosixhiya/teamspeak-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settingsInput } from "../../../test/support/adminService.js";
import { type Gateway, useGateway } from "../../../test/support/gateway.js";
import type { FakeTSClient } from "../../../test/support/fakeTsClient.js";
import type { JoinTicketPayload } from "../../modules/join/joinTicket.js";

const gateways = useGateway();
const JSON_HEADERS = { "content-type": "application/json" };
const HOUR_MS = 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

async function post(gateway: Gateway, body: unknown, headers: Record<string, string> = JSON_HEADERS) {
  const response = await gateway.request("/api/join-ticket", { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, unknown> };
}

/** Asks for a ticket, expects one, and returns what the gateway stored behind it. */
async function issued(gateway: Gateway, body: unknown): Promise<JoinTicketPayload> {
  const { status, body: result } = await post(gateway, body);
  expect(status, JSON.stringify(result)).toBe(201);
  const payload = gateway.joinTickets.consume(result.ticket as string);
  expect(payload).not.toBeNull();
  return payload!;
}

function configure(gateway: Gateway, overrides: Parameters<typeof settingsInput>[0]) {
  gateway.adminService.updateSettings(settingsInput(overrides));
}

describe("a normal join", () => {
  it("issues a single-use ticket for the configured target and password, uncached", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "8.8.8.8:9988", accessMode: "fixed", passwordAction: "replace", serverPassword: "admin-pass" });
    const { status, headers, body } = await post(gateway, { nickname: "alice" });
    expect(status).toBe(201);
    expect(headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ ok: true, ticket: expect.any(String) });
    const stored = gateway.joinTickets.consume(body.ticket as string);
    expect(stored).toEqual({ target: { host: "8.8.8.8", port: 9988 }, serverPassword: "admin-pass", nickname: "alice" });
    expect(gateway.joinTickets.consume(body.ticket as string)).toBeNull();
  });

  it("opens the voice socket with the ticket and reaches the fake TeamSpeak server with the nickname", async () => {
    const gateway = await gateways.start();
    const { body } = await post(gateway, { nickname: "alice", channel: "Room B" });
    const socket = await gateway.openVoice(body.ticket as string);
    await socket.waitForMessage("connected");
    const client = gateway.ts.created[0] as FakeTSClient;
    expect(client.options).toMatchObject({ nickname: "alice", defaultChannel: "Room B" });
    expect(client.getChannelId()).toBe(3n);
  });

  it("closes a socket whose ticket has expired (30 s) with 4001", async () => {
    const gateway = await gateways.start();
    const ticket = gateway.ticket();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 31_000);
    const socket = await gateway.openVoice(ticket);
    expect(await socket.waitForClose()).toEqual({ code: 4001, reason: "Join ticket required" });
  });
});

describe("what the request must look like", () => {
  it("rejects a request that is not JSON, or has no origin, or comes from another origin, with 403 ORIGIN_REJECTED", async () => {
    const gateway = await gateways.start();
    const body = JSON.stringify({ nickname: "alice" });
    const cases: [string, Record<string, string>, boolean][] = [
      ["not JSON", { "content-type": "text/plain" }, true],
      ["no origin", JSON_HEADERS, false],
      ["other origin", { ...JSON_HEADERS, origin: "https://evil.example" }, false],
    ];
    for (const [label, headers, sameOrigin] of cases) {
      const response = await (sameOrigin
        ? gateway.request("/api/join-ticket", { method: "POST", headers, body })
        : fetch(`${gateway.url}/api/join-ticket`, { method: "POST", headers, body }));
      expect(response.status, label).toBe(403);
      expect(await response.json(), label).toEqual({ ok: false, code: "ORIGIN_REJECTED" });
    }
  });

  it("answers 503 NOT_INITIALIZED before an administrator account exists", async () => {
    const gateway = await gateways.start({ initialize: false });
    expect(await post(gateway, { nickname: "alice" })).toMatchObject({ status: 503, body: { ok: false, code: "NOT_INITIALIZED" } });
  });

  it("allows 30 requests a minute per peer and then answers 429 RATE_LIMITED, counting invalid ones too", async () => {
    const gateway = await gateways.start();
    for (let i = 0; i < 29; i++) expect((await post(gateway, { nickname: "" })).status).toBe(400);
    expect((await post(gateway, { nickname: "alice" })).status).toBe(201);
    expect(await post(gateway, { nickname: "alice" })).toMatchObject({ status: 429, body: { ok: false, code: "RATE_LIMITED" } });
  });
});

describe("nickname, channel and identity", () => {
  it("refuses a missing, blank or non-string nickname with 400 INVALID_NICKNAME", async () => {
    const gateway = await gateways.start();
    for (const body of [{}, { nickname: "" }, { nickname: "   " }, { nickname: 42 }, { nickname: null }, []]) {
      expect(await post(gateway, body), JSON.stringify(body)).toMatchObject({ status: 400, body: { code: "INVALID_NICKNAME" } });
    }
  });

  it("trims the nickname and cuts it to 30 characters rather than refusing it", async () => {
    const gateway = await gateways.start();
    expect((await issued(gateway, { nickname: "  alice  " })).nickname).toBe("alice");
    expect((await issued(gateway, { nickname: "n".repeat(80) })).nickname).toBe("n".repeat(30));
  });

  it("trims the channel, cuts it to 100 characters and leaves it out when empty", async () => {
    const gateway = await gateways.start();
    expect((await issued(gateway, { nickname: "a", channel: " Room A " })).channel).toBe("Room A");
    expect((await issued(gateway, { nickname: "a", channel: "c".repeat(150) })).channel).toBe("c".repeat(100));
    expect(await issued(gateway, { nickname: "a", channel: "  " })).not.toHaveProperty("channel");
  });

  it("keeps a valid identity and marks it remembered; a corrupt or oversize one is ignored, not an error", async () => {
    const gateway = await gateways.start();
    const identity = generateIdentity(8).toString();
    expect(await issued(gateway, { nickname: "a", identity })).toMatchObject({ identity, rememberIdentity: true });
    for (const bad of ["garbage", "x".repeat(8193)]) {
      const payload = await issued(gateway, { nickname: "a", identity: bad });
      expect(payload, bad.slice(0, 10)).not.toHaveProperty("identity");
      expect(payload).not.toHaveProperty("rememberIdentity");
    }
  });

  it("marks the ticket remembered when the client asks for a new identity to be kept", async () => {
    const gateway = await gateways.start();
    expect(await issued(gateway, { nickname: "a", rememberIdentity: true })).toMatchObject({ rememberIdentity: true });
    expect(await issued(gateway, { nickname: "a", rememberIdentity: "yes" })).not.toHaveProperty("rememberIdentity");
  });
});

describe("fixed access mode", () => {
  it("ignores a target from the browser, and takes a non-blank server password from it", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "8.8.8.8:9988", accessMode: "fixed", passwordAction: "replace", serverPassword: "admin-pass" });
    const withTarget = await issued(gateway, { nickname: "a", target: "1.1.1.1:1111", serverPassword: "typed" });
    expect(withTarget).toMatchObject({ target: { host: "8.8.8.8", port: 9988 }, serverPassword: "typed" });
    expect((await issued(gateway, { nickname: "a", serverPassword: "   " })).serverPassword).toBe("admin-pass");
  });
});

describe("open access mode", () => {
  const openMode = (gateway: Gateway) =>
    configure(gateway, { target: "8.8.8.8:9988", accessMode: "open", passwordAction: "replace", serverPassword: "admin-pass" });

  it("accepts a public target from the browser", async () => {
    const gateway = await gateways.start();
    openMode(gateway);
    expect(await issued(gateway, { nickname: "a", target: "1.1.1.1:5555" })).toMatchObject({ target: { host: "1.1.1.1", port: 5555 } });
  });

  it("refuses private, loopback, link-local and unparsable targets with 400 TARGET_NOT_ALLOWED", async () => {
    const gateway = await gateways.start();
    openMode(gateway);
    for (const target of [
      "10.0.0.5:9987",
      "127.0.0.1:9987",
      "192.168.1.5",
      "169.254.169.254:80",
      "[::1]:9987",
      "localhost",
      "not a target:::",
    ]) {
      expect(await post(gateway, { nickname: "a", target }), target).toMatchObject({
        status: 400,
        body: { ok: false, code: "TARGET_NOT_ALLOWED" },
      });
    }
  });

  it("still checks a target that equals the administrator's default", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "127.0.0.1:9987", accessMode: "open" });
    expect(await post(gateway, { nickname: "a", target: "127.0.0.1:9987" })).toMatchObject({
      status: 400,
      body: { code: "TARGET_NOT_ALLOWED" },
    });
  });

  it("never sends the administrator's server password to a target the browser chose", async () => {
    const gateway = await gateways.start();
    openMode(gateway);
    expect((await issued(gateway, { nickname: "a", target: "1.1.1.1:5555" })).serverPassword).toBe("");
    expect((await issued(gateway, { nickname: "a", target: "1.1.1.1:5555", serverPassword: "typed" })).serverPassword).toBe("typed");
    expect((await issued(gateway, { nickname: "a", target: "1.1.1.1:5555", serverPassword: "p".repeat(600) })).serverPassword).toBe(
      "p".repeat(512),
    );
  });

  it("keeps the administrator's password for the default target, unless the browser sends its own", async () => {
    const gateway = await gateways.start();
    openMode(gateway);
    expect((await issued(gateway, { nickname: "a", target: "8.8.8.8:9988" })).serverPassword).toBe("admin-pass");
    expect((await issued(gateway, { nickname: "a", target: "8.8.8.8:9988", serverPassword: "typed" })).serverPassword).toBe("typed");
    expect(await issued(gateway, { nickname: "a" })).toMatchObject({
      target: { host: "8.8.8.8", port: 9988 },
      serverPassword: "admin-pass",
    });
  });
});

describe("managed invites", () => {
  async function invite(gateway: Gateway, body: Record<string, unknown> = { channel: "Room A", expiresInHours: 24, maxUses: 1 }) {
    const admin = await gateway.adminLogin();
    const created = (await (await admin.post("invites", body)).json()) as { invite: { id: string }; token: string };
    return { admin, id: created.invite.id, token: created.token };
  }

  it("uses the target, password and channel the invite was created with, whatever the browser asks for", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "8.8.8.8:9988", accessMode: "open", passwordAction: "replace", serverPassword: "admin-pass" });
    const { token } = await invite(gateway);
    configure(gateway, { target: "1.1.1.1:1111", accessMode: "open", passwordAction: "remove" });
    const payload = await issued(gateway, { nickname: "a", invite: token, target: "9.9.9.9:9", channel: "" });
    expect(payload).toMatchObject({ target: { host: "8.8.8.8", port: 9988 }, serverPassword: "admin-pass", channel: "Room A" });
  });

  it("lets the browser's channel win over the invite's", async () => {
    const gateway = await gateways.start();
    const { token } = await invite(gateway);
    expect((await issued(gateway, { nickname: "a", invite: token, channel: "Room B" })).channel).toBe("Room B");
  });

  it("consumes a single-use invite once and answers 400 INVITE_INVALID afterwards", async () => {
    const gateway = await gateways.start();
    const { token } = await invite(gateway);
    expect((await post(gateway, { nickname: "a", invite: token })).status).toBe(201);
    expect(await post(gateway, { nickname: "a", invite: token })).toMatchObject({
      status: 400,
      body: { ok: false, code: "INVITE_INVALID" },
    });
  });

  it("lets an unlimited invite (maxUses 0) be used again and again", async () => {
    const gateway = await gateways.start();
    const { token } = await invite(gateway, { channel: "", expiresInHours: 1, maxUses: 0 });
    for (let i = 0; i < 5; i++) expect((await post(gateway, { nickname: "a", invite: token })).status, `use ${i + 1}`).toBe(201);
  });

  it("refuses an expired invite", async () => {
    const gateway = await gateways.start();
    const { token } = await invite(gateway, { channel: "", expiresInHours: 1, maxUses: 5 });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + HOUR_MS + 1000);
    expect(await post(gateway, { nickname: "a", invite: token })).toMatchObject({ status: 400, body: { code: "INVITE_INVALID" } });
  });

  it("refuses a revoked invite", async () => {
    const gateway = await gateways.start();
    const { admin, id, token } = await invite(gateway, { channel: "", expiresInHours: 1, maxUses: 5 });
    expect((await admin.post(`invites/${id}/revoke`)).status).toBe(200);
    expect(await post(gateway, { nickname: "a", invite: token })).toMatchObject({ status: 400, body: { code: "INVITE_INVALID" } });
  });

  it("refuses a token that is unknown or does not look like one", async () => {
    const gateway = await gateways.start();
    for (const token of ["a".repeat(43), "short", "has spaces and !!! characters......................"]) {
      expect(await post(gateway, { nickname: "a", invite: token }), token).toMatchObject({ status: 400, body: { code: "INVITE_INVALID" } });
    }
  });

  it("skips the open-mode target check for an invite, because the invite fixes the target", async () => {
    const gateway = await gateways.start();
    const { token } = await invite(gateway);
    configure(gateway, { target: "8.8.8.8:9988", accessMode: "open" });
    expect((await post(gateway, { nickname: "a", invite: token, target: "127.0.0.1:9987" })).status).toBe(201);
  });
});

describe("acceleration", () => {
  it("refuses a request for acceleration when no relay is configured, with 400 ACCELERATION_UNAVAILABLE", async () => {
    const gateway = await gateways.start();
    for (const body of [{ accelerated: true }, { accelerationRelayId: "relay-1" }]) {
      expect(await post(gateway, { nickname: "a", ...body })).toMatchObject({ status: 400, body: { code: "ACCELERATION_UNAVAILABLE" } });
    }
  });

  it("accepts a configured relay, by default or by id, and refuses an unknown id", async () => {
    const gateway = await gateways.start();
    configure(gateway, {
      relaySettingsAction: "replace",
      relayEnabled: true,
      relayName: "Relay one",
      relayTarget: "relay.example.org:39087",
      relayTokenAction: "replace",
      relayToken: "relay-token",
    });
    const config = (await (await gateway.request("/api/public-config")).json()) as { accelerationRelays: { id: string }[] };
    const id = config.accelerationRelays[0]!.id;
    expect(await issued(gateway, { nickname: "a", accelerated: true })).toMatchObject({ accelerated: true });
    expect(await issued(gateway, { nickname: "a", accelerationRelayId: id })).toMatchObject({ accelerated: true, accelerationRelayId: id });
    expect(await post(gateway, { nickname: "a", accelerationRelayId: "nope" })).toMatchObject({
      status: 400,
      body: { code: "ACCELERATION_UNAVAILABLE" },
    });
  });

  it("a request refused for acceleration leaves the invite usable", async () => {
    const gateway = await gateways.start();
    const admin = await gateway.adminLogin();
    const { token } = (await (await admin.post("invites", { channel: "", expiresInHours: 1, maxUses: 1 })).json()) as { token: string };
    expect((await post(gateway, { nickname: "a", invite: token, accelerated: true })).body.code).toBe("ACCELERATION_UNAVAILABLE");
    expect((await post(gateway, { nickname: "a", invite: token, accelerationRelayId: "nope" })).body.code).toBe("ACCELERATION_UNAVAILABLE");
    expect((await post(gateway, { nickname: "a", invite: token })).status).toBe(201);
  });

  it("an invite that is used by a request that is accepted is still used up", async () => {
    const gateway = await gateways.start();
    const admin = await gateway.adminLogin();
    const { token } = (await (await admin.post("invites", { channel: "", expiresInHours: 1, maxUses: 1 })).json()) as { token: string };
    expect((await post(gateway, { nickname: "a", invite: token })).status).toBe(201);
    expect((await post(gateway, { nickname: "a", invite: token })).body.code).toBe("INVITE_INVALID");
  });
});
