import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVER_ID, serverInput, settingsInput } from "../../../test/support/adminService.js";
import type { FakeTSClient } from "../../../test/support/fakeTsClient.js";
import { type AdminApi, type Gateway, TEST_ADMIN_PASSWORD, useGateway } from "../../../test/support/gateway.js";
import { WebSpeakDatabase } from "../../infra/persistence/database.js";

const gateways = useGateway();
const HOUR_MS = 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

async function start(options?: Parameters<typeof gateways.start>[0]): Promise<{ gateway: Gateway; admin: AdminApi }> {
  const gateway = await gateways.start(options);
  return { gateway, admin: await gateway.adminLogin() };
}

const audit = (gateway: Gateway) => gateway.database.listAudit({ limit: 50, offset: 0 }).events.map((row) => row.event);

describe("sessions", () => {
  it("lists nothing when nobody is connected", async () => {
    const { admin } = await start();
    expect(await json(await admin.get("sessions"))).toEqual({ sessions: [] });
  });

  it("describes each live session, oldest first, with its audio counters", async () => {
    const { gateway, admin } = await start();
    const first = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    await first.waitForMessage("connected");
    const second = await gateway.openVoice(gateway.ticket({ nickname: "bob", channel: "Room B" }));
    await second.waitForMessage("connected");
    const { sessions } = await json(await admin.get("sessions"));
    expect(sessions.map((session: { nickname: string }) => session.nickname)).toEqual(["alice", "bob"]);
    const [alice, bob] = sessions;
    expect(alice).toMatchObject({
      id: expect.stringMatching(/^w-/),
      target: "ts.test:9987",
      state: "connected",
      tsClientId: (gateway.ts.created[0] as FakeTSClient).getClientId(),
      channelId: "1",
      memberCount: 2,
      ageSeconds: expect.any(Number),
    });
    expect(bob).toMatchObject({ channelId: "3", memberCount: 2 });
    expect(Date.parse(alice.createdAt)).not.toBeNaN();
    expect(alice.audio).toMatchObject({
      ingressFrames: 0,
      ingressDroppedFrames: 0,
      tsSendFrames: 0,
      tsReceiveFrames: 0,
      egressFrames: 0,
      egressDroppedFrames: 0,
    });
  });

  it("terminates a session: the socket closes with a reason, the TeamSpeak client leaves, and it is audited once", async () => {
    const { gateway, admin } = await start();
    const socket = await gateway.openVoice();
    await socket.waitForMessage("connected");
    const { sessions } = await json(await admin.get("sessions"));
    const id = sessions[0].id as string;
    const response = await admin.post(`sessions/${id}/terminate`);
    expect([response.status, await json(response)]).toEqual([200, { ok: true }]);
    expect(await socket.waitForClose()).toEqual({ code: 1000, reason: "admin-terminated" });
    expect((gateway.ts.created[0] as FakeTSClient).isConnected()).toBe(false);
    expect(gateway.ts.members.size).toBe(0);
    expect((await json(await admin.get("sessions"))).sessions).toEqual([]);
    expect(audit(gateway).filter((event) => event === "ADMIN_SESSION_TERMINATED")).toHaveLength(1);
    const again = await admin.post(`sessions/${id}/terminate`);
    expect([again.status, await json(again)]).toEqual([404, { ok: false, code: "SESSION_NOT_FOUND" }]);
  });

  it("answers 404 SESSION_NOT_FOUND for an unknown session and audits nothing", async () => {
    const { gateway, admin } = await start();
    const response = await admin.post("sessions/w-nothing/terminate");
    expect([response.status, await json(response)]).toEqual([404, { ok: false, code: "SESSION_NOT_FOUND" }]);
    expect(audit(gateway)).not.toContain("ADMIN_SESSION_TERMINATED");
  });
});

describe("invites", () => {
  const create = async (admin: AdminApi, body: Record<string, unknown> = {}) => {
    const response = await admin.post("invites", { serverId: DEFAULT_SERVER_ID, ...body });
    return { status: response.status, body: await json(response) };
  };

  it("creates an invite for a server with a token that is shown once", async () => {
    const { gateway, admin } = await start();
    gateway.adminService.updateServer(DEFAULT_SERVER_ID, serverInput({ target: "8.8.8.8:9988" }));
    const { status, body } = await create(admin, { channel: " Room A ", expiresInHours: 2, maxUses: 3 });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      ok: true,
      token: expect.stringMatching(/^[\w-]{43}$/),
      invite: {
        id: expect.stringMatching(/^invite-/),
        serverId: DEFAULT_SERVER_ID,
        target: "8.8.8.8:9988",
        channel: "Room A",
        maxUses: 3,
        useCount: 0,
        revokedAt: null,
        status: "active",
      },
    });
    expect(Date.parse(body.invite.expiresAt) - Date.now()).toBeGreaterThan(2 * HOUR_MS - 60_000);
    const listed = await (await admin.get("invites")).text();
    expect(listed).toContain(body.invite.id);
    expect(listed).not.toContain(body.token);
    expect(audit(gateway)[0]).toBe("INVITE_CREATED");
  });

  it("refuses an invite without a known server", async () => {
    const { admin } = await start();
    expect(await create(admin, { serverId: "server-gone" })).toMatchObject({ status: 400, body: { code: "SERVER_NOT_FOUND" } });
    expect(await create(admin, { serverId: undefined })).toMatchObject({ status: 400, body: { code: "SERVER_NOT_FOUND" } });
  });

  it("defaults to one hour and unlimited uses, and cuts a long channel to 100 characters", async () => {
    const { admin } = await start();
    const { body } = await create(admin, { channel: "c".repeat(150) });
    expect(body.invite).toMatchObject({ maxUses: 0, channel: "c".repeat(100) });
    expect(Date.parse(body.invite.expiresAt) - Date.now()).toBeLessThanOrEqual(HOUR_MS);
    expect(Date.parse(body.invite.expiresAt) - Date.now()).toBeGreaterThan(HOUR_MS - 60_000);
  });

  it("refuses an expiry outside 1 to 720 hours and a use count outside 0 to 10000, or either as text", async () => {
    const { admin } = await start();
    const cases: [Record<string, unknown>, string][] = [
      [{ expiresInHours: 0 }, "INVALID_INVITE_EXPIRY"],
      [{ expiresInHours: 721 }, "INVALID_INVITE_EXPIRY"],
      [{ expiresInHours: "5" }, "INVALID_INVITE_EXPIRY"],
      [{ maxUses: -1 }, "INVALID_INVITE_USES"],
      [{ maxUses: 10001 }, "INVALID_INVITE_USES"],
      [{ maxUses: 1.5 }, "INVALID_INVITE_USES"],
      [{ maxUses: "2" }, "INVALID_INVITE_USES"],
    ];
    for (const [body, code] of cases)
      expect(await create(admin, body), JSON.stringify(body)).toMatchObject({ status: 400, body: { ok: false, code } });
    expect((await create(admin, { expiresInHours: 720, maxUses: 10000 })).status).toBe(201);
    expect((await json(await admin.get("invites"))).invites).toHaveLength(1);
  });

  it("shows use count and status as an invite is used up, expires or is revoked", async () => {
    const { gateway, admin } = await start();
    const single = (await create(admin, { maxUses: 1 })).body;
    const timed = (await create(admin, { expiresInHours: 1 })).body;
    const revoked = (await create(admin, {})).body;
    const statuses = async () =>
      Object.fromEntries(
        (await json(await admin.get("invites"))).invites.map((invite: { id: string; status: string; useCount: number }) => [
          invite.id,
          `${invite.status}/${invite.useCount}`,
        ]),
      );
    expect(await statuses()).toEqual({ [single.invite.id]: "active/0", [timed.invite.id]: "active/0", [revoked.invite.id]: "active/0" });
    expect(
      (
        await gateway.request("/api/join-ticket", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nickname: "a", invite: single.token }),
        })
      ).status,
    ).toBe(201);
    expect((await admin.post(`invites/${revoked.invite.id}/revoke`)).status).toBe(200);
    expect(gateway.database.listAudit({ limit: 1, offset: 0 }).events[0]).toMatchObject({
      event: "INVITE_REVOKED",
      details: { id: revoked.invite.id, serverName: "WebSpeak", useCount: 0, ip: expect.stringMatching(/\S/) },
    });
    expect(await statuses()).toEqual({
      [single.invite.id]: "exhausted/1",
      [timed.invite.id]: "active/0",
      [revoked.invite.id]: "revoked/0",
    });
    // All three expire after an hour, a revoked invite stays revoked and a used-up one now reads as expired.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * HOUR_MS);
    expect(await statuses()).toEqual({ [single.invite.id]: "expired/1", [timed.invite.id]: "expired/0", [revoked.invite.id]: "revoked/0" });
  });

  it("revokes an invite once, audits it, and answers 404 for a second try or an unknown one", async () => {
    const { gateway, admin } = await start();
    const { invite } = (await create(admin)).body;
    const first = await admin.post(`invites/${invite.id}/revoke`);
    expect([first.status, await json(first)]).toEqual([200, { ok: true }]);
    expect(audit(gateway)[0]).toBe("INVITE_REVOKED");
    for (const id of [invite.id, "invite-unknown-1"]) {
      const response = await admin.post(`invites/${id}/revoke`);
      expect([response.status, await json(response)], id).toEqual([404, { ok: false, code: "INVITE_NOT_FOUND" }]);
    }
  });

  it("refuses a malformed invite id with 400 INVALID_INVITE_ID", async () => {
    const { admin } = await start();
    for (const id of ["not-an-invite", "invite-with space", `invite-${"a".repeat(100)}`, "invite-%00"]) {
      const response = await admin.post(`invites/${encodeURIComponent(id)}/revoke`);
      expect([response.status, (await json(response)).code], id).toEqual([400, "INVALID_INVITE_ID"]);
    }
  });
});

describe("audit", () => {
  it("lists the newest events first with their kind, details and times", async () => {
    const { gateway, admin } = await start();
    gateway.database.addAudit("FIRST");
    gateway.database.addAudit("ADMIN_LOGIN_FAILED", { reason: "x" });
    const { events, total } = await json(await admin.get("audit"));
    expect(total).toBeGreaterThanOrEqual(2);
    expect(events.slice(0, 2)).toMatchObject([
      { event: "ADMIN_LOGIN_FAILED", category: "auth", severity: "warning", details: { reason: "x" } },
      { event: "FIRST", category: "system", severity: "info", details: {} },
    ]);
    expect(Date.parse(events[0].createdAt)).not.toBeNaN();
  });

  it("pages with a limit from 1 to 100 and an offset, and says how many events there are", async () => {
    const { gateway, admin } = await start();
    for (let i = 0; i < 60; i++) gateway.database.addAudit(`EVENT_${i}`);
    const page = async (query: string) => json(await admin.get(`audit${query}`));
    expect((await page("")).events).toHaveLength(25);
    const all = await page("?limit=100");
    expect(all.events).toHaveLength(all.total);
    expect(all.total).toBeGreaterThan(60);
    expect((await page("?limit=3&offset=1")).events.map((event: { event: string }) => event.event)).toEqual([
      "EVENT_58",
      "EVENT_57",
      "EVENT_56",
    ]);
    expect((await page("?limit=3&offset=1")).total).toBe(all.total);
    expect((await page("?offset=1000")).events).toEqual([]);
  });

  it("filters by category, severity, time and text", async () => {
    const { gateway, admin } = await start();
    gateway.database.addAudit("ADMIN_LOGIN_FAILED");
    gateway.database.addAudit("SERVER_UNAVAILABLE", { name: "Main" });
    gateway.database.addAudit("INVITE_CREATED", { channel: "Lobby" });
    const names = async (query: string) =>
      (await json(await admin.get(`audit?${query}`))).events.map((event: { event: string }) => event.event);
    expect(await names("categories=availability,invites")).toEqual(["INVITE_CREATED", "SERVER_UNAVAILABLE"]);
    expect(await names("categories=")).toEqual([]);
    expect(await names("severities=error")).toEqual(["SERVER_UNAVAILABLE"]);
    expect(await names("severities=warning,error")).toEqual(["SERVER_UNAVAILABLE", "ADMIN_LOGIN_FAILED"]);
    expect(await names("severities=")).toEqual([]);
    expect(await names("q=lobby")).toEqual(["INVITE_CREATED"]);
    expect(await names(`since=${encodeURIComponent(new Date(Date.now() + HOUR_MS).toISOString())}`)).toEqual([]);
  });

  it("refuses a query it cannot read", async () => {
    const { admin } = await start();
    const queries = [
      "limit=0",
      "limit=101",
      "limit=2.5",
      "limit=abc",
      "limit=",
      "offset=-1",
      "categories=auth,nope",
      "severities=loud",
      "since=yesterday",
      `q=${"x".repeat(101)}`,
      "limit=1&limit=2",
    ];
    for (const query of queries) {
      const response = await admin.get(`audit?${query}`);
      expect([response.status, (await json(response)).code], query).toEqual([400, "INVALID_AUDIT_QUERY"]);
    }
  });
});

describe("backup", () => {
  it("downloads a consistent copy of the database, without plaintext secrets, and audits it", async () => {
    const { gateway, admin } = await start();
    await admin.put("server", settingsInput({ siteName: "Backed up" }));
    await admin.put(`servers/${DEFAULT_SERVER_ID}`, serverInput({ passwordAction: "replace", serverPassword: "s3cret-server-pass" }));
    const response = await admin.get("backup");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="webspeak-backup-\d{4}-\d{2}-\d{2}\.db"$/);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 15).toString()).toBe("SQLite format 3");
    expect(bytes.includes("s3cret-server-pass")).toBe(false);
    expect(bytes.includes(TEST_ADMIN_PASSWORD)).toBe(false);
    const copyDir = join(gateway.dataDir, "restore");
    mkdirSync(copyDir);
    writeFileSync(join(copyDir, "webspeak.db"), bytes);
    const copy = new WebSpeakDatabase(join(copyDir, "webspeak.db"));
    try {
      expect(copy.hasAdmin()).toBe(true);
      expect(copy.getSettings()).toMatchObject({ siteName: "Backed up" });
      expect(copy.listServers()).toMatchObject([{ host: "ts.example.org" }]);
    } finally {
      copy.close();
    }
    expect(audit(gateway)[0]).toBe("ADMIN_BACKUP_EXPORTED");
  });
});

describe("diagnostics", () => {
  it("summarizes the gateway, the sessions, TeamSpeak, the database and the log", async () => {
    const { gateway, admin } = await start();
    const socket = await gateway.openVoice();
    await socket.waitForMessage("connected");
    const body = await json(await admin.get("diagnostics"));
    expect(Object.keys(body).sort()).toEqual(["database", "gateway", "generatedAt", "logs", "servers", "sessions"]);
    expect(body.gateway).toMatchObject({ version: "9.9.9", node: process.version, platform: process.platform, arch: process.arch });
    expect(body.sessions).toEqual({ active: 1, peak: 1, created: 1, limit: 100 });
    expect(body.servers).toMatchObject([{ status: "unknown" }]);
    expect(body.database).toEqual({ schemaVersion: gateway.database.schemaVersion });
    expect(body.logs).toEqual({ available: false });
    writeFileSync(gateway.logFile, "");
    expect((await json(await admin.get("diagnostics"))).logs).toEqual({ available: true });
  });

  it("downloads a report that carries no secret", async () => {
    const { gateway, admin } = await start();
    await admin.put(`servers/${DEFAULT_SERVER_ID}`, serverInput({ passwordAction: "replace", serverPassword: "s3cret-server-pass" }));
    await admin.put(
      "server",
      settingsInput({
        relayNodes: [
          { name: "Relay", target: "relay.example.org:39087", enabled: true, tokenAction: "replace", token: "s3cret-relay-token" },
        ],
      }),
    );
    const response = await admin.get("diagnostics/report");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="webspeak-diagnostic-report.json"');
    const text = await response.text();
    const report = JSON.parse(text);
    expect(Object.keys(report).sort()).toEqual(["audit", "database", "gateway", "generatedAt", "servers", "sessions"]);
    expect(report.audit.map((entry: { event: string }) => entry.event)).toContain("SETTINGS_CHANGED");
    expect(text).toContain('\n  "gateway"');
    const credential = gateway.database.getAdminCredential()!;
    for (const secret of [
      "s3cret-server-pass",
      "s3cret-relay-token",
      TEST_ADMIN_PASSWORD,
      credential.hash,
      credential.salt,
      admin.csrfToken,
      admin.cookie.split("=")[1]!,
    ]) {
      expect(text.includes(secret), secret.slice(0, 12)).toBe(false);
    }
  });
});

describe("invite paging", () => {
  it("returns a page with the total, filtered by status, and refuses a bad query", async () => {
    const { admin } = await start();
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const created = await json(await admin.post("invites", { serverId: DEFAULT_SERVER_ID, channel: "", expiresInHours: 1, maxUses: 0 }));
      ids.push(created.invite.id);
    }
    await admin.post(`invites/${ids[0]}/revoke`);
    const page = await json(await admin.get("invites?limit=2&offset=0"));
    expect(page.invites).toHaveLength(2);
    expect(page.total).toBe(3);
    const revoked = await json(await admin.get("invites?status=revoked"));
    expect(revoked).toMatchObject({ total: 1, invites: [{ id: ids[0], status: "revoked" }] });
    for (const query of ["limit=0", "limit=101", "limit=x", "offset=-1", "offset=1.5", "status=nope"]) {
      const response = await admin.get(`invites?${query}`);
      expect([query, response.status]).toEqual([query, 400]);
      expect(await json(response)).toMatchObject({ code: "INVALID_INVITE_QUERY" });
    }
  });
});
