import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { WebSpeakDatabase } from "../../../infra/persistence/database.js";
import { buildBundleFiles, zipBundle, BUNDLE_FORMAT } from "./diagnosticBundle.js";
import { readLogTail } from "./logTail.js";
import { Pseudonyms } from "./pseudonyms.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "webspeak-bundle-"));
  dirs.push(dir);
  return dir;
}

const overview = {
  gateway: { status: "running" as const, version: "1.2.3", uptimeSeconds: 60 },
  servers: [],
  sessions: { active: 0, peak: 1, limit: 100 },
  invites: { active: 0 },
};

function seededDatabase(dir: string): WebSpeakDatabase {
  const database = new WebSpeakDatabase(join(dir, "webspeak.db"));
  database.addServer({
    id: "server-1",
    name: "Clan Server",
    host: "ts.clan.example.org",
    port: 9987,
    passwordEncrypted: "v1.secret-ciphertext",
  });
  database.beginConnection({
    id: "w-1",
    nickname: "Mallory",
    clientIp: "203.0.113.9",
    target: "ts.clan.example.org:9987",
    relayName: null,
    relayTarget: null,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0 mallory@example.org",
  });
  database.finishConnection("w-1", {
    reason: "CONNECTION_REFUSED",
    failureDetail: "Mallory from 203.0.113.9 refused by ts.clan.example.org",
    durationSeconds: null,
    audio: null,
  });
  database.addAudit("ADMIN_LOGIN_FAILED", { username: "hunter", ip: "198.51.100.4" });
  return database;
}

describe("buildBundleFiles", () => {
  it("writes every file and none of them carries a name, an address or a secret", () => {
    const dir = tempDir();
    const logDir = join(dir, "logs");
    mkdirSync(logDir);
    writeFileSync(
      join(logDir, "webspeak.log"),
      [
        JSON.stringify({ level: 30, msg: "WebClient connecting", nickname: "Mallory", clientIp: "203.0.113.9", password: "pw-in-log" }),
        "plain line from 203.0.113.9 about Mallory",
        "",
      ].join("\n"),
    );
    const database = seededDatabase(dir);
    const files = buildBundleFiles({
      database,
      overview,
      version: "1.2.3",
      runtime: { host: "0.0.0.0", port: 3000, tls: false, logDir },
      liveSessions: [],
      createdSessions: 1,
      now: new Date("2026-10-28T10:00:00Z"),
    });
    database.close();

    expect(Object.keys(files).sort()).toEqual([
      "README.txt",
      "config.json",
      "environment.json",
      "events.json",
      "log-tail.ndjson",
      "servers.json",
      "sessions.json",
      "summary.json",
    ]);
    const everything = Object.values(files).join("\n");
    for (const leaked of [
      "Mallory",
      "203.0.113.9",
      "198.51.100.4",
      "hunter",
      "Clan Server",
      "ts.clan.example",
      "pw-in-log",
      "secret-ciphertext",
    ]) {
      expect(everything.includes(leaked), leaked).toBe(false);
    }
    expect(JSON.parse(files["summary.json"]!)).toMatchObject({ bundleFormat: BUNDLE_FORMAT, generatedAt: "2026-10-28T10:00:00.000Z" });
    expect(JSON.parse(files["environment.json"]!).listen).toEqual({ host: "0.0.0.0", port: 3000, tls: false });
    const servers = JSON.parse(files["servers.json"]!) as Array<Record<string, unknown>>;
    expect(servers.find((server) => server.host === "host-1.org")).toMatchObject({
      serverName: expect.stringMatching(/^server-\d+$/),
      hasPassword: true,
    });
  });

  it("keeps the same guest the same label in every file, so the failure can be followed", () => {
    const dir = tempDir();
    const database = seededDatabase(dir);
    const files = buildBundleFiles({ database, overview, version: "1.2.3", runtime: { tls: false }, liveSessions: [], createdSessions: 0 });
    database.close();
    const history = JSON.parse(files["sessions.json"]!).history as Array<Record<string, string>>;
    expect(history[0]).toMatchObject({
      nickname: "guest-1",
      clientIp: "ip-1/public",
      target: "host-1.org:9987",
      reason: "CONNECTION_REFUSED",
    });
    expect(history[0]!.failureDetail).toBe("guest-1 from ip-1/public refused by host-1.org");
    const failed = JSON.parse(files["events.json"]!).find((event: { event: string }) => event.event === "ADMIN_LOGIN_FAILED");
    expect(failed.details).toEqual({ username: "user-1", ip: expect.stringMatching(/^ip-\d+\/public$/) });
    expect(failed.details.ip).not.toBe("ip-1/public");
  });

  it("names the browser of a session and counts them, but leaves the raw user agent out of the public bundle", () => {
    const dir = tempDir();
    const database = seededDatabase(dir);
    const files = buildBundleFiles({ database, overview, version: "1.2.3", runtime: { tls: false }, liveSessions: [], createdSessions: 0 });
    database.close();
    const [record] = JSON.parse(files["sessions.json"]!).history;
    expect(record.client).toMatchObject({ browser: "Firefox", browserVersion: "140.0", os: "Linux", platform: "desktop" });
    expect(record).not.toHaveProperty("userAgent");
    expect(Object.values(files).join("\n")).not.toContain("Gecko/20100101");
    expect(JSON.parse(files["summary.json"]!).connections.byBrowser).toEqual({ Firefox: 1 });
  });

  it("states the retention in force, the log files included", () => {
    const dir = tempDir();
    const database = seededDatabase(dir);
    const files = buildBundleFiles({ database, overview, version: "1.2.3", runtime: { tls: false }, liveSessions: [], createdSessions: 0 });
    database.close();
    expect(JSON.parse(files["config.json"]!).retention).toMatchObject({ logs: { days: 30 } });
  });

  it("keeps event names readable and labels the admin account the same in every file", () => {
    const dir = tempDir();
    const database = seededDatabase(dir);
    database.addAudit("ADMIN_PASSWORD_RESET", { username: "admin" });
    database.addAudit("ADMIN_LOGIN_FAILED", { username: "admin", ip: "198.51.100.4" });
    const files = buildBundleFiles({ database, overview, version: "1.2.3", runtime: { tls: false }, liveSessions: [], createdSessions: 0 });
    database.close();
    for (const name of ["summary.json", "events.json"]) {
      expect(files[name], name).toContain("ADMIN_LOGIN_FAILED");
      expect(files[name], name).not.toMatch(/user-\d+_LOGIN/);
    }
  });

  it("states the proxy setting and the browser that asked, and merges a burst of settings changes", () => {
    const dir = tempDir();
    const database = seededDatabase(dir);
    database.updateSettings(
      { ...database.getSettings(), webRtcUdpStart: 41000 },
      { changes: [{ field: "a", from: 1, to: 2 }], ip: "198.51.100.4" },
    );
    database.updateSettings(
      { ...database.getSettings(), webRtcUdpStart: 42000 },
      { changes: [{ field: "a", from: 2, to: 3 }], ip: "198.51.100.4" },
    );
    const files = buildBundleFiles({
      database,
      overview,
      version: "1.2.3",
      runtime: { tls: false },
      liveSessions: [],
      createdSessions: 0,
      requester: { userAgent: "Firefox/140", forwardedFor: true },
    });
    database.close();
    expect(JSON.parse(files["environment.json"]!)).toMatchObject({
      proxy: { trustProxy: expect.any(Boolean), forwardedForOnThisRequest: true },
      adminBrowser: "Firefox/140",
    });
    const settings = JSON.parse(files["events.json"]!).filter((event: { event: string }) => event.event === "SETTINGS_CHANGED");
    expect(settings).toHaveLength(1);
    expect(settings[0].details).toMatchObject({ changes: [{ field: "a", from: 1, to: 3 }], merged: 2 });
  });

  it("zips the files under their own names", () => {
    const zipped = unzipSync(zipBundle({ "a.json": "{}\n", "README.txt": "hi" }));
    expect(Object.keys(zipped).sort()).toEqual(["README.txt", "a.json"]);
    expect(strFromU8(zipped["README.txt"]!)).toBe("hi");
  });
});

describe("readLogTail", () => {
  it("is empty without a log", () => {
    expect(readLogTail(undefined, new Pseudonyms())).toBe("");
    expect(readLogTail(join(tempDir(), "missing"), new Pseudonyms())).toBe("");
  });

  it("reads the newest lines across rotated files and drops a cut first line", () => {
    const dir = tempDir();
    const line = (n: number) => JSON.stringify({ n, pad: "x".repeat(40) });
    writeFileSync(join(dir, "webspeak.log.1"), `${line(1)}\n${line(2)}\n`);
    writeFileSync(join(dir, "webspeak.log"), `${line(3)}\n${line(4)}\n`);
    const all = readLogTail(dir, new Pseudonyms())
      .split("\n")
      .map((entry) => JSON.parse(entry).n);
    expect(all).toEqual([1, 2, 3, 4]);
    const size = Buffer.byteLength(`${line(3)}\n${line(4)}\n`);
    const cut = readLogTail(dir, new Pseudonyms(), size + 10)
      .split("\n")
      .map((entry) => JSON.parse(entry).n);
    expect(cut).toEqual([3, 4]);
    const tiny = readLogTail(dir, new Pseudonyms(), Buffer.byteLength(`${line(4)}\n`) + 5)
      .split("\n")
      .map((entry) => JSON.parse(entry).n);
    expect(tiny).toEqual([4]);
  });
});
