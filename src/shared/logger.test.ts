import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLogger, RotatingFileStream } from "./logger.js";

const DAY_MS = 86_400_000;
const dirs: string[] = [];
const streams: RotatingFileStream[] = [];
afterEach(() => {
  for (const stream of streams.splice(0)) stream.destroy();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function logDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "webspeak-log-"));
  dirs.push(dir);
  return dir;
}

const line = (daysAgo: number) =>
  `${JSON.stringify({ level: 30, time: new Date(Date.now() - daysAgo * DAY_MS).toISOString(), msg: "x" })}\n`;

/** Writes a file and sets its last-write time, which is what a rotated file is judged by. */
function file(path: string, text: string, ageDays = 0): void {
  writeFileSync(path, text);
  const time = new Date(Date.now() - ageDays * DAY_MS);
  utimesSync(path, time, time);
}

function open(path: string): RotatingFileStream {
  const stream = new RotatingFileStream(path);
  streams.push(stream);
  return stream;
}

describe("log retention", () => {
  it("leaves every file alone until a retention is set", () => {
    const path = join(logDir(), "webspeak.log");
    file(path, line(40), 40);
    file(`${path}.1`, line(50), 50);
    open(path);
    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.1`)).toBe(true);
  });

  it("rotates a file once its oldest line is half the retention old, and keeps a younger one", () => {
    const old = join(logDir(), "webspeak.log");
    file(old, line(6) + line(0), 0);
    open(old).setRetentionDays(10);
    expect(existsSync(old)).toBe(false);
    expect(readFileSync(`${old}.1`, "utf8")).toContain('"msg":"x"');

    const young = join(logDir(), "webspeak.log");
    file(young, line(4) + line(0));
    open(young).setRetentionDays(10);
    expect(existsSync(young)).toBe(true);
    expect(existsSync(`${young}.1`)).toBe(false);
  });

  it("deletes rotated files whose newest line is half the retention old, and only those", () => {
    const path = join(logDir(), "webspeak.log");
    file(`${path}.1`, line(1), 1);
    file(`${path}.2`, line(6), 6);
    file(`${path}.3`, line(30), 30);
    open(path).setRetentionDays(10);
    expect([1, 2, 3].map((index) => existsSync(`${path}.${index}`))).toEqual([true, false, false]);
  });

  it("applies a shorter retention at once and a longer one keeps what is left", () => {
    const path = join(logDir(), "webspeak.log");
    file(`${path}.1`, line(4), 4);
    const stream = open(path);
    stream.setRetentionDays(30);
    expect(existsSync(`${path}.1`)).toBe(true);
    stream.setRetentionDays(6);
    expect(existsSync(`${path}.1`)).toBe(false);
  });

  it("starts a fresh file after a rotation for age and writes the next line into it", async () => {
    const path = join(logDir(), "webspeak.log");
    file(path, line(9));
    const stream = open(path);
    stream.setRetentionDays(10);
    await new Promise<void>((resolve, reject) => stream.write(line(0), (error) => (error ? reject(error) : resolve())));
    expect(readFileSync(path, "utf8").split("\n").filter(Boolean)).toHaveLength(1);
    expect(readFileSync(`${path}.1`, "utf8").split("\n").filter(Boolean)).toHaveLength(1);
  });

  it("takes a file without a readable time as written when it was last touched, so an old one is gone entirely", () => {
    const path = join(logDir(), "webspeak.log");
    file(path, "not json at all\n", 8);
    open(path).setRetentionDays(10);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}.1`)).toBe(false);
  });

  it("can be asked for by a logger without a log directory, which has nothing to trim", () => {
    expect(() => createLogger().setLogRetentionDays(7)).not.toThrow();
  });
});
