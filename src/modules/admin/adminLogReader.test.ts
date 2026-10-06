import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readConnectionHistory, readRecentLogs } from "./adminLogReader.js";

describe("adminLogReader", () => {
  let dir: string;
  let logFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "admin-log-reader-"));
    logFile = join(dir, "gateway.log");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const lines = (entries: object[]) => `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;

  it("returns nothing without a log file", () => {
    expect(readRecentLogs(undefined, 10)).toEqual([]);
    expect(readConnectionHistory(undefined, 10)).toEqual([]);
    expect(readRecentLogs(logFile, 10)).toEqual([]);
  });

  it("keeps the last lines, maps level numbers and whitelists context fields", () => {
    writeFileSync(logFile, `${lines([
      { level: 30, time: "2026-01-01T10:00:00.000Z", msg: "first" },
      { level: 50, time: "2026-01-01T10:00:01.000Z", msg: "second", component: "voice", secret: "x", attempt: 2 },
    ])}not json\n`);
    const entries = readRecentLogs(logFile, 2);
    expect(entries).toEqual([
      { timestamp: "2026-01-01T10:00:01.000Z", level: "ERROR", message: "second", context: { component: "voice", attempt: 2 } },
      { timestamp: null, level: "INFO", message: "not json", context: {} },
    ]);
  });

  it("rebuilds a session from the log messages the voice module writes", () => {
    writeFileSync(logFile, lines([
      { level: 30, time: "2026-01-01T10:00:00.000Z", msg: "WebClient connecting", entryId: "w1", nickname: "ada", clientIp: "10.0.0.1", target: "ts.test:9987" },
      { level: 30, time: "2026-01-01T10:00:02.000Z", msg: "Web client connected to TeamSpeak", entryId: "w1" },
      { level: 30, time: "2026-01-01T10:01:02.000Z", msg: "Client session torn down", entryId: "w1", reason: "websocket-close" },
    ]));
    expect(readConnectionHistory(logFile, 10)).toEqual([{
      id: "w1",
      nickname: "ada",
      clientIp: "10.0.0.1",
      target: "ts.test:9987",
      relayName: null,
      relayTarget: null,
      startedAt: "2026-01-01T10:00:00.000Z",
      connectedAt: "2026-01-01T10:00:02.000Z",
      disconnectedAt: "2026-01-01T10:01:02.000Z",
      durationSeconds: 60,
      status: "disconnected",
      reason: null,
      failureDetail: null,
    }]);
  });

  it("marks a failed connect with its code", () => {
    writeFileSync(logFile, lines([
      { level: 30, time: "2026-01-01T10:00:00.000Z", msg: "WebClient connecting", entryId: "w2" },
      { level: 50, time: "2026-01-01T10:00:01.000Z", msg: "TS connect failed", entryId: "w2", code: "TS_BANNED", failureDetail: "banned" },
    ]));
    const [record] = readConnectionHistory(logFile, 10);
    expect(record).toMatchObject({ status: "failed", reason: "TS_BANNED", failureDetail: "banned", nickname: "—" });
  });
});
