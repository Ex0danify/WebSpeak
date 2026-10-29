import { describe, expect, it, vi } from "vitest";
import { TeamSpeakServerError } from "../../lib/teamspeak/index.js";
import { FakeTeamSpeakServer } from "../../../test/support/fakeTsClient.js";
import { type Gateway, useGateway } from "../../../test/support/gateway.js";
import { settingsInput } from "../../../test/support/adminService.js";

const gateways = useGateway();

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

async function start(options?: Parameters<typeof gateways.start>[0]) {
  const gateway = await gateways.start(options);
  return { gateway, admin: await gateway.adminLogin() };
}

const events = (gateway: Gateway) => gateway.database.listAudit({ limit: 50, offset: 0, categories: ["sessions"] }).events;

describe("connection history", () => {
  it("records a session from its first step to its end, with the events that go with it", async () => {
    const { gateway, admin } = await start();
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    await socket.waitForMessage("connected");
    const live = (await json(await admin.get("connections"))).records[0];
    expect(live).toMatchObject({ nickname: "alice", target: "ts.test:9987", status: "active", disconnectedAt: null, reason: null });
    expect(live.clientIp).toEqual(expect.any(String));
    expect(events(gateway).map((event) => event.event)).toEqual(["SESSION_CONNECTED"]);

    socket.close();
    await vi.waitFor(async () => expect((await json(await admin.get("connections"))).records[0].status).toBe("disconnected"));
    const { records, total } = await json(await admin.get("connections"));
    expect(total).toBe(1);
    expect(records[0]).toMatchObject({
      id: live.id,
      nickname: "alice",
      connectedAt: live.connectedAt,
      durationSeconds: expect.any(Number),
    });
    expect(events(gateway).map((event) => event.event)).toEqual(["SESSION_ENDED", "SESSION_CONNECTED"]);
    expect(events(gateway)[0]).toMatchObject({
      category: "sessions",
      severity: "info",
      details: { nickname: "alice", endedBy: "websocket-close" },
    });
  });

  it("keeps the browser the guest joined with, as reported and as read", async () => {
    const { gateway, admin } = await start();
    const agent = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }), { "user-agent": agent });
    await socket.waitForMessage("connected");
    const [record] = (await json(await admin.get("connections"))).records;
    expect(record.userAgent).toBe(agent);
    expect(record.client).toMatchObject({ browser: "Chrome", os: "Android", platform: "mobile" });
  });

  it("records a refused join as failed, with the reason TeamSpeak gave and a warning in the event log", async () => {
    const { gateway, admin } = await start();
    gateway.ts.failNext("connect", new TeamSpeakServerError({ id: 513, serverMessage: "nickname is already in use" }));
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    await socket.waitForClose();
    await vi.waitFor(async () => expect((await json(await admin.get("connections"))).records[0].status).toBe("failed"));
    const [record] = (await json(await admin.get("connections"))).records;
    expect(record).toMatchObject({ reason: "NICKNAME_IN_USE", connectedAt: null, durationSeconds: null });
    expect(events(gateway)[0]).toMatchObject({
      event: "SESSION_CONNECT_FAILED",
      severity: "warning",
      details: { code: "NICKNAME_IN_USE" },
    });
  });

  it("closes the record of a session whose TeamSpeak client could not be created", async () => {
    class BrokenServer extends FakeTeamSpeakServer {
      override readonly createClient = () => {
        throw new Error("no native library");
      };
    }
    const { gateway, admin } = await start({ ts: new BrokenServer() });
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    await socket.waitForClose();
    const [record] = (await json(await admin.get("connections"))).records;
    expect(record).toMatchObject({ status: "failed", reason: "TEAM_SPEAK_CLIENT_UNAVAILABLE" });
  });

  it("filters, searches and pages the records, and refuses a bad query", async () => {
    const { gateway, admin } = await start();
    for (const nickname of ["olga", "fred", "lena"]) {
      const socket = await gateway.openVoice(gateway.ticket({ nickname }));
      await socket.waitForMessage("connected");
      socket.close();
      await vi.waitFor(() => expect(gateway.database.listConnections({ limit: 10, offset: 0, statuses: ["active"] }).total).toBe(0));
    }
    expect((await json(await admin.get("connections?limit=2"))).records.map((record: { nickname: string }) => record.nickname)).toEqual([
      "lena",
      "fred",
    ]);
    expect((await json(await admin.get("connections?q=olg"))).total).toBe(1);
    expect((await json(await admin.get("connections?statuses=failed"))).total).toBe(0);
    expect((await json(await admin.get("connections?statuses="))).total).toBe(0);
    for (const query of ["statuses=nope", "limit=0", "limit=101", "offset=-1", `q=${"x".repeat(101)}`]) {
      const response = await admin.get(`connections?${query}`);
      expect([response.status, (await json(response)).code]).toEqual([400, "INVALID_CONNECTION_QUERY"]);
    }
  });

  it("is only for a signed-in admin", async () => {
    const gateway = await gateways.start();
    expect((await gateway.request("/api/admin/connections")).status).toBe(401);
  });
});

describe("retention settings", () => {
  it("are saved with the settings, shown again and refused outside their bounds", async () => {
    const { admin } = await start();
    const body = settingsInput({ eventLogRetentionDays: 30, eventLogMaxRows: 2000, connectionRetentionDays: 7, connectionMaxRows: 500 });
    expect((await admin.put("server", body)).status).toBe(200);
    expect(await json(await admin.get("server"))).toMatchObject({
      eventLogRetentionDays: 30,
      eventLogMaxRows: 2000,
      connectionRetentionDays: 7,
      connectionMaxRows: 500,
    });
    const refused = await admin.put("server", { ...body, connectionMaxRows: 999_999_999_999 });
    expect([refused.status, (await json(refused)).code]).toEqual([400, "INVALID_CONNECTION_ROWS"]);
  });

  it("trim the logs as soon as they shrink", async () => {
    const { gateway, admin } = await start();
    for (let i = 0; i < 150; i++) gateway.database.addAudit("SERVER_ADDED", { id: `s-${i}` });
    await admin.put("server", settingsInput({ eventLogMaxRows: 100 }));
    expect(gateway.database.listAudit({ limit: 1, offset: 0 }).total).toBe(100);
  });
});
