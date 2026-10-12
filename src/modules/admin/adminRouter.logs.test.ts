import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { useGateway } from "../../../test/support/gateway.js";

const gateways = useGateway();

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

async function start(options?: Parameters<typeof gateways.start>[0]) {
  const gateway = await gateways.start(options);
  return { gateway, admin: await gateway.adminLogin() };
}

const jsonLines = (lines: unknown[]) => lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n") + "\n";

describe("logs", () => {
  it("says the log is not available when there is no file", async () => {
    const { admin } = await start();
    expect(await json(await admin.get("logs"))).toEqual({ available: false, entries: [], sessions: [] });
  });

  it("returns the last lines in order with a level name and only the known context fields", async () => {
    const { gateway, admin } = await start();
    writeFileSync(
      gateway.logFile,
      jsonLines([
        { level: 30, time: "2026-01-01T10:00:00.000Z", msg: "old line" },
        { level: 10, time: "2026-01-01T10:00:01.000Z", msg: "debug line" },
        {
          level: 40,
          time: "2026-01-01T10:00:02.000Z",
          msg: "warn line",
          component: "web",
          attempt: 2,
          reconnect: true,
          serverPassword: "hunter2",
          token: "t0ken",
          identity: "id-secret",
          nested: { a: 1 },
          port: 3040,
        },
        { level: 50, time: "2026-01-01T10:00:03.000Z", msg: "error line" },
        { level: 60, time: "2026-01-01T10:00:04.000Z", msg: "fatal line" },
        "this is not json",
      ]),
    );
    const body = await json(await admin.get("logs?limit=5"));
    expect(body.available).toBe(true);
    expect(body.entries.map((entry: { message: string }) => entry.message)).toEqual([
      "debug line",
      "warn line",
      "error line",
      "fatal line",
      "this is not json",
    ]);
    expect(body.entries.map((entry: { level: string }) => entry.level)).toEqual(["DEBUG", "WARN", "ERROR", "FATAL", "INFO"]);
    expect(body.entries[1].context).toEqual({ component: "web", attempt: 2, reconnect: true, port: 3040 });
    expect(JSON.stringify(body)).not.toMatch(/hunter2|t0ken|id-secret/);
    expect(body.entries[4]).toEqual({ timestamp: null, level: "INFO", message: "this is not json", context: {} });
  });

  it("returns 100 lines by default, at least 1 and at most 200", async () => {
    const { gateway, admin } = await start();
    writeFileSync(
      gateway.logFile,
      jsonLines(Array.from({ length: 250 }, (_, i) => ({ level: 30, time: "2026-01-01T10:00:00.000Z", msg: `line ${i}` }))),
    );
    const entries = async (limit?: string) =>
      (await json(await admin.get(limit === undefined ? "logs" : `logs?limit=${limit}`))).entries as { message: string }[];
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
    writeFileSync(
      `${gateway.logFile}.1`,
      jsonLines([
        {
          level: 30,
          time: "2026-01-01T09:00:00.000Z",
          msg: "WebClient connecting",
          entryId: "w-old",
          nickname: "olga",
          clientIp: "10.0.0.1",
          target: "ts.test:9987",
        },
        { level: 30, time: "2026-01-01T09:00:02.000Z", msg: "Web client connected to TeamSpeak", entryId: "w-old" },
        {
          level: 30,
          time: "2026-01-01T09:10:02.000Z",
          msg: "Client session torn down",
          entryId: "w-old",
          reason: "websocket-close",
          durationSeconds: 600,
        },
      ]),
    );
    writeFileSync(
      gateway.logFile,
      jsonLines([
        {
          level: 30,
          time: "2026-01-01T10:00:00.000Z",
          msg: "WebClient connecting",
          entryId: "w-failed",
          nickname: "fred",
          clientIp: "10.0.0.2",
          target: "ts.test:9987",
          relayName: "Relay one",
          relayTarget: "relay.test:39087",
        },
        {
          level: 40,
          time: "2026-01-01T10:00:01.000Z",
          msg: "TS connect failed",
          entryId: "w-failed",
          code: "BANNED",
          failureDetail: "you are banned",
        },
        {
          level: 30,
          time: "2026-01-01T10:00:02.000Z",
          msg: "Client session torn down",
          entryId: "w-failed",
          reason: "teamSpeak-connect-failed",
          failureCode: "BANNED",
        },
        {
          level: 30,
          time: "2026-01-01T11:00:00.000Z",
          msg: "WebClient connecting",
          entryId: "w-live",
          nickname: "lena",
          clientIp: "10.0.0.3",
          target: "ts.test:9987",
        },
        { level: 30, time: "2026-01-01T11:00:03.000Z", msg: "Web client connected to TeamSpeak", entryId: "w-live" },
        { level: 30, time: "2026-01-01T11:30:00.000Z", msg: "WebClient connecting", entryId: "w-wait" },
        { level: 30, time: "2026-01-01T12:00:00.000Z", msg: "an unrelated line without an entry id" },
      ]),
    );
    const { sessions } = await json(await admin.get("logs"));
    expect(sessions.map((session: { id: string; status: string }) => `${session.id}:${session.status}`)).toEqual([
      "w-wait:connecting",
      "w-live:active",
      "w-failed:failed",
      "w-old:disconnected",
    ]);
    const byId = Object.fromEntries(sessions.map((session: { id: string }) => [session.id, session]));
    expect(byId["w-old"]).toMatchObject({
      nickname: "olga",
      clientIp: "10.0.0.1",
      target: "ts.test:9987",
      startedAt: "2026-01-01T09:00:00.000Z",
      connectedAt: "2026-01-01T09:00:02.000Z",
      disconnectedAt: "2026-01-01T09:10:02.000Z",
      durationSeconds: 600,
      reason: null,
      relayName: null,
    });
    expect(byId["w-failed"]).toMatchObject({
      reason: "BANNED",
      failureDetail: "you are banned",
      relayName: "Relay one",
      relayTarget: "relay.test:39087",
      connectedAt: null,
      durationSeconds: null,
    });
    expect(byId["w-live"]).toMatchObject({ disconnectedAt: null, durationSeconds: expect.any(Number) });
    expect(byId["w-wait"]).toMatchObject({ nickname: "—", clientIp: "—", target: "—", connectedAt: null });
    expect((await json(await admin.get("logs?limit=2"))).sessions.map((session: { id: string }) => session.id)).toEqual([
      "w-wait",
      "w-live",
    ]);
  });
});
