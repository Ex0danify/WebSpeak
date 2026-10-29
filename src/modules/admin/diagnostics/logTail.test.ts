import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLogTail } from "./logTail.js";
import { Pseudonyms } from "./pseudonyms.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "webspeak-logtail-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, lines: string[]) => writeFileSync(join(dir, name), lines.map((line) => `${line}\n`).join(""));

describe("readLogTail", () => {
  it("is empty without a log directory or without logs", () => {
    expect(readLogTail(undefined, new Pseudonyms())).toBe("");
    expect(readLogTail(join(dir, "missing"), new Pseudonyms())).toBe("");
    mkdirSync(join(dir, "empty"));
    expect(readLogTail(join(dir, "empty"), new Pseudonyms())).toBe("");
  });

  it("redacts JSON lines by key and scrubs other lines", () => {
    write("webspeak.log", [JSON.stringify({ msg: "joined", nickname: "Mallory", token: "secret" }), "plain line from 203.0.113.9"]);
    expect(readLogTail(dir, new Pseudonyms()).split("\n")).toEqual([
      JSON.stringify({ msg: "joined", nickname: "guest-1", token: "[removed]" }),
      "plain line from ip-1/public",
    ]);
  });

  it("reads the rotated files oldest first", () => {
    write("webspeak.log.2", ["oldest"]);
    write("webspeak.log.1", ["older"]);
    write("webspeak.log", ["newest"]);
    expect(readLogTail(dir, new Pseudonyms())).toBe("oldest\nolder\nnewest");
  });

  it("ends a file without a final newline on a line of its own", () => {
    writeFileSync(join(dir, "webspeak.log.1"), "first");
    write("webspeak.log", ["second"]);
    expect(readLogTail(dir, new Pseudonyms())).toBe("first\nsecond");
  });

  it("cuts from the end at a whole line and leaves the older files out", () => {
    write("webspeak.log.1", ["never read"]);
    write("webspeak.log", ["aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc"]);
    expect(readLogTail(dir, new Pseudonyms(), 25)).toBe("bbbbbbbbbb\ncccccccccc");
  });
});
