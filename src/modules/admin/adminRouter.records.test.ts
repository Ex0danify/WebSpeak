import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settingsInput } from "../../../test/helpers/adminService.js";
import type { FakeTSClient } from "../../../test/helpers/fakeTsClient.js";
import { type AdminApi, type Gateway, TEST_ADMIN_PASSWORD, useGateway } from "../../../test/helpers/gateway.js";
import { WebSpeakDatabase } from "../../infra/persistence/database.js";

const gateways = useGateway();
const HOUR_MS = 60 * 60 * 1000;

afterEach(() => { vi.useRealTimers(); });

async function json(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

async function start(options?: Parameters<typeof gateways.start>[0]): Promise<{ gateway: Gateway; admin: AdminApi }> {
  const gateway = await gateways.start(options);
  return { gateway, admin: await gateway.adminLogin() };
}

const audit = (gateway: Gateway) => gateway.database.recentAudit(50).map((row) => row.event);
const jsonLines = (lines: unknown[]) => lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n") + "\n";

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
    expect(alice).toMatchObject({ id: expect.stringMatching(/^w-/), target: "ts.test:9987", state: "connected", tsClientId: (gateway.ts.created[0] as FakeTSClient).getClientId(), channelId: "1", memberCount: 2, ageSeconds: expect.any(Number) });
    expect(bob).toMatchObject({ channelId: "3", memberCount: 2 });
    expect(Date.parse(alice.createdAt)).not.toBeNaN();
    expect(alice.audio).toMatchObject({ ingressFrames: 0, ingressDroppedFrames: 0, tsSendFrames: 0, tsReceiveFrames: 0, egressFrames: 0, egressDroppedFrames: 0 });
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
    const response = await admin.post("invites", body);
    return { status: response.status, body: await json(response) };
  };

  it("creates an invite for the current target with a token that is shown once", async () => {
    const { gateway, admin } = await start();
    gateway.adminService.updateSettings(settingsInput({ target: "8.8.8.8:9988" }));
    const { status, body } = await create(admin, { channel: " Room A ", expiresInHours: 2, maxUses: 3 });
    expect(status).toBe(201);
    expect(body).toMatchObject({ ok: true, token: expect.stringMatching(/^[\w-]{43}$/), invite: { id: expect.stringMatching(/^invite-/), target: "8.8.8.8:9988", channel: "Room A", maxUses: 3, useCount: 0, revokedAt: null, status: "active" } });
    expect(Date.parse(body.invite.expiresAt) - Date.now()).toBeGreaterThan(2 * HOUR_MS - 60_000);
    const listed = await (await admin.get("invites")).text();
    expect(listed).toContain(body.invite.id);
    expect(listed).not.toContain(body.token);
    expect(audit(gateway)[0]).toBe("INVITE_CREATED");
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
      [{ expiresInHours: 0 }, "INVALID_INVITE_EXPIRY"], [{ expiresInHours: 721 }, "INVALID_INVITE_EXPIRY"], [{ expiresInHours: "5" }, "INVALID_INVITE_EXPIRY"],
      [{ maxUses: -1 }, "INVALID_INVITE_USES"], [{ maxUses: 10001 }, "INVALID_INVITE_USES"], [{ maxUses: 1.5 }, "INVALID_INVITE_USES"], [{ maxUses: "2" }, "INVALID_INVITE_USES"],
    ];
    for (const [body, code] of cases) expect(await create(admin, body), JSON.stringify(body)).toMatchObject({ status: 400, body: { ok: false, code } });
    expect((await create(admin, { expiresInHours: 720, maxUses: 10000 })).status).toBe(201);
    expect((await json(await admin.get("invites"))).invites).toHaveLength(1);
  });

  it("shows use count and status as an invite is used up, expires or is revoked", async () => {
    const { gateway, admin } = await start();
    const single = (await create(admin, { maxUses: 1 })).body;
    const timed = (await create(admin, { expiresInHours: 1 })).body;
    const revoked = (await create(admin, {})).body;
    const statuses = async () => Object.fromEntries((await json(await admin.get("invites"))).invites.map((invite: { id: string; status: string; useCount: number }) => [invite.id, `${invite.status}/${invite.useCount}`]));
    expect(await statuses()).toEqual({ [single.invite.id]: "active/0", [timed.invite.id]: "active/0", [revoked.invite.id]: "active/0" });
    expect((await gateway.request("/api/join-ticket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "a", invite: single.token }) })).status).toBe(201);
    expect((await admin.post(`invites/${revoked.invite.id}/revoke`)).status).toBe(200);
    expect(await statuses()).toEqual({ [single.invite.id]: "exhausted/1", [timed.invite.id]: "active/0", [revoked.invite.id]: "revoked/0" });
    // All three expire after an hour; a revoked invite stays revoked, a used-up one now reads as expired.
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
  it("lists the newest events first with their times", async () => {
    const { gateway, admin } = await start();
    gateway.database.addAudit("FIRST");
    gateway.database.addAudit("SECOND");
    const { events } = await json(await admin.get("audit"));
    expect(events.slice(0, 2).map((event: { event: string }) => event.event)).toEqual(["SECOND", "FIRST"]);
    expect(Date.parse(events[0].createdAt)).not.toBeNaN();
  });

  it("takes a limit from 1 up, ignores one that is not a number, and never returns more than 50", async () => {
    const { gateway, admin } = await start();
    for (let i = 0; i < 60; i++) gateway.database.addAudit(`EVENT_${i}`);
    const count = async (limit?: string) => (await json(await admin.get(limit === undefined ? "audit" : `audit?limit=${limit}`))).events.length;
    expect(await count()).toBe(50);
    expect(await count("3")).toBe(3);
    expect(await count("2.9")).toBe(2);
    expect(await count("0")).toBe(1);
    expect(await count("-5")).toBe(1);
    expect(await count("abc")).toBe(50);
    // The route accepts up to 200, but the database returns at most 50.
    expect(await count("200")).toBe(50);
  });
});

describe("logs", () => {
  it("says the log is not available when there is no file", async () => {
    const { admin } = await start();
    expect(await json(await admin.get("logs"))).toEqual({ available: false, entries: [], sessions: [] });
  });

  it("returns the last lines in order with a level name and only the known context fields", async () => {
    const { gateway, admin } = await start();
    writeFileSync(gateway.logFile, jsonLines([
      { level: 30, time: "2026-01-01T10:00:00.000Z", msg: "old line" },
      { level: 10, time: "2026-01-01T10:00:01.000Z", msg: "debug line" },
      { level: 40, time: "2026-01-01T10:00:02.000Z", msg: "warn line", component: "web", attempt: 2, reconnect: true, serverPassword: "hunter2", token: "t0ken", identity: "id-secret", nested: { a: 1 }, port: 3040 },
      { level: 50, time: "2026-01-01T10:00:03.000Z", msg: "error line" },
      { level: 60, time: "2026-01-01T10:00:04.000Z", msg: "fatal line" },
      "this is not json",
    ]));
    const body = await json(await admin.get("logs?limit=5"));
    expect(body.available).toBe(true);
    expect(body.entries.map((entry: { message: string }) => entry.message)).toEqual(["debug line", "warn line", "error line", "fatal line", "this is not json"]);
    expect(body.entries.map((entry: { level: string }) => entry.level)).toEqual(["DEBUG", "WARN", "ERROR", "FATAL", "INFO"]);
    expect(body.entries[1].context).toEqual({ component: "web", attempt: 2, reconnect: true, port: 3040 });
    expect(JSON.stringify(body)).not.toMatch(/hunter2|t0ken|id-secret/);
    expect(body.entries[4]).toEqual({ timestamp: null, level: "INFO", message: "this is not json", context: {} });
  });

  it("returns 100 lines by default, at least 1 and at most 200", async () => {
    const { gateway, admin } = await start();
    writeFileSync(gateway.logFile, jsonLines(Array.from({ length: 250 }, (_, i) => ({ level: 30, time: "2026-01-01T10:00:00.000Z", msg: `line ${i}` }))));
    const entries = async (limit?: string) => (await json(await admin.get(limit === undefined ? "logs" : `logs?limit=${limit}`))).entries as { message: string }[];
    const byDefault = await entries();
    expect(byDefault).toHaveLength(100);
    expect([byDefault[0]!.message, byDefault.at(-1)!.message]).toEqual(["line 150", "line 249"]);
    expect(await entries("0")).toHaveLength(1);
    expect(await entries("-3")).toHaveLength(1);
    expect(await entries("500")).toHaveLength(200);
    expect(await entries("abc")).toHaveLength(100);
  });

  it("rebuilds the connection history from the log, including the rotated file, newest first", async () => {
    const { gateway, admin } = await start();
    writeFileSync(`${gateway.logFile}.1`, jsonLines([
      { level: 30, time: "2026-01-01T09:00:00.000Z", msg: "WebClient connecting", entryId: "w-old", nickname: "olga", clientIp: "10.0.0.1", target: "ts.test:9987" },
      { level: 30, time: "2026-01-01T09:00:02.000Z", msg: "Web client connected to TeamSpeak", entryId: "w-old" },
      { level: 30, time: "2026-01-01T09:10:02.000Z", msg: "Client session torn down", entryId: "w-old", reason: "websocket-close", durationSeconds: 600 },
    ]));
    writeFileSync(gateway.logFile, jsonLines([
      { level: 30, time: "2026-01-01T10:00:00.000Z", msg: "WebClient connecting", entryId: "w-failed", nickname: "fred", clientIp: "10.0.0.2", target: "ts.test:9987", relayName: "Relay one", relayTarget: "relay.test:39087" },
      { level: 40, time: "2026-01-01T10:00:01.000Z", msg: "TS connect failed", entryId: "w-failed", code: "BANNED", failureDetail: "you are banned" },
      { level: 30, time: "2026-01-01T10:00:02.000Z", msg: "Client session torn down", entryId: "w-failed", reason: "teamSpeak-connect-failed", failureCode: "BANNED" },
      { level: 30, time: "2026-01-01T11:00:00.000Z", msg: "WebClient connecting", entryId: "w-live", nickname: "lena", clientIp: "10.0.0.3", target: "ts.test:9987" },
      { level: 30, time: "2026-01-01T11:00:03.000Z", msg: "Web client connected to TeamSpeak", entryId: "w-live" },
      { level: 30, time: "2026-01-01T11:30:00.000Z", msg: "WebClient connecting", entryId: "w-wait" },
      { level: 30, time: "2026-01-01T12:00:00.000Z", msg: "an unrelated line without an entry id" },
    ]));
    const { sessions } = await json(await admin.get("logs"));
    expect(sessions.map((session: { id: string; status: string }) => `${session.id}:${session.status}`)).toEqual(["w-wait:connecting", "w-live:active", "w-failed:failed", "w-old:disconnected"]);
    const byId = Object.fromEntries(sessions.map((session: { id: string }) => [session.id, session]));
    expect(byId["w-old"]).toMatchObject({ nickname: "olga", clientIp: "10.0.0.1", target: "ts.test:9987", startedAt: "2026-01-01T09:00:00.000Z", connectedAt: "2026-01-01T09:00:02.000Z", disconnectedAt: "2026-01-01T09:10:02.000Z", durationSeconds: 600, reason: null, relayName: null });
    expect(byId["w-failed"]).toMatchObject({ reason: "BANNED", failureDetail: "you are banned", relayName: "Relay one", relayTarget: "relay.test:39087", connectedAt: null, durationSeconds: null });
    expect(byId["w-live"]).toMatchObject({ disconnectedAt: null, durationSeconds: expect.any(Number) });
    expect(byId["w-wait"]).toMatchObject({ nickname: "—", clientIp: "—", target: "—", connectedAt: null });
    expect((await json(await admin.get("logs?limit=2"))).sessions.map((session: { id: string }) => session.id)).toEqual(["w-wait", "w-live"]);
  });
});

describe("backup", () => {
  it("downloads a consistent copy of the database, without plaintext secrets, and audits it", async () => {
    const { gateway, admin } = await start();
    await admin.put("server", settingsInput({ siteName: "Backed up", passwordAction: "replace", serverPassword: "s3cret-server-pass" }));
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
      expect(copy.getSettings()).toMatchObject({ siteName: "Backed up", tsHost: "ts.example.org" });
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
    expect(Object.keys(body).sort()).toEqual(["database", "gateway", "generatedAt", "logs", "sessions", "teamSpeak"]);
    expect(body.gateway).toMatchObject({ version: "9.9.9", node: process.version, platform: process.platform, arch: process.arch });
    expect(body.sessions).toEqual({ active: 1, peak: 1, created: 1, limit: 100 });
    expect(body.teamSpeak).toMatchObject({ status: "unknown" });
    expect(body.database).toEqual({ schemaVersion: gateway.database.schemaVersion });
    expect(body.logs).toEqual({ available: false });
    writeFileSync(gateway.logFile, "");
    expect((await json(await admin.get("diagnostics"))).logs).toEqual({ available: true });
  });

  it("downloads a report that carries no secret", async () => {
    const { gateway, admin } = await start();
    await admin.put("server", settingsInput({
      passwordAction: "replace", serverPassword: "s3cret-server-pass",
      relaySettingsAction: "replace", relayEnabled: true, relayName: "Relay", relayTarget: "relay.example.org:39087", relayTokenAction: "replace", relayToken: "s3cret-relay-token",
    }));
    const response = await admin.get("diagnostics/report");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="webspeak-diagnostic-report.json"');
    const text = await response.text();
    const report = JSON.parse(text);
    expect(Object.keys(report).sort()).toEqual(["audit", "database", "gateway", "generatedAt", "sessions", "teamSpeak"]);
    expect(report.audit.map((entry: { event: string }) => entry.event)).toContain("SETTINGS_CHANGED");
    expect(text).toContain('\n  "gateway"');
    const credential = gateway.database.getAdminCredential()!;
    for (const secret of ["s3cret-server-pass", "s3cret-relay-token", TEST_ADMIN_PASSWORD, credential.hash, credential.salt, admin.csrfToken, admin.cookie.split("=")[1]!]) {
      expect(text.includes(secret), secret.slice(0, 12)).toBe(false);
    }
  });
});
