import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtureFile, hasFixture } from "../../../../test/support/tsCaptureFixtures.js";
import { shareFirstRowFields, splitCommandRows } from "./commandRows.js";
import { parseCommand } from "./commandText.js";

// Capture fixtures stay local, CI skips the capture tests.
const hasFixtures = hasFixture("ts6ServerSession.json");

function capturedCommands(file: string): string[] {
  const session = JSON.parse(readFileSync(fixtureFile(file)!, "utf8")) as { commands: { direction: string; text: string }[] };
  return session.commands.filter((command) => command.direction === "s2c").map((command) => command.text);
}

describe("splitCommandRows", () => {
  it("splits on raw pipes only", () => {
    expect(splitCommandRows("a=x\\py|a=2")).toEqual(["a=x\\py", "a=2"]);
  });

  it("returns one empty row for an empty text", () => {
    expect(splitCommandRows("")).toEqual([""]);
  });
});

describe("shareFirstRowFields", () => {
  it("returns no rows for no rows", () => {
    expect(shareFirstRowFields([])).toEqual([]);
  });

  it("gives every row the fields only the first row carries", () => {
    const parsed = parseCommand("notifycliententerview cfid=0 ctid=1 reasonid=2 clid=129 client_nickname=a|clid=133 client_nickname=b");
    expect(parsed.rows).toEqual([
      { cfid: "0", ctid: "1", reasonid: "2", clid: "129", client_nickname: "a" },
      { cfid: "0", ctid: "1", reasonid: "2", clid: "133", client_nickname: "b" },
    ]);
  });

  it("lets a later row override a first-row field", () => {
    expect(parseCommand("x a=1 b=1|b=2").rows[1]).toEqual({ a: "1", b: "2" });
  });

  it("does not carry a field from a middle row into the next one", () => {
    expect(parseCommand("x a=1|a=2 extra=y|a=3").rows[2]).toEqual({ a: "3" });
  });

  it("shares cldbid, cid and return_code of notifyeffectivepermissions", () => {
    const rows = parseCommand("notifyeffectivepermissions cldbid=3 cid=1 return_code=q p=252 v=-1|p=253 v=-1").rows;
    expect(rows[1]).toEqual({ cldbid: "3", cid: "1", return_code: "q", p: "253", v: "-1" });
  });
});

describe.skipIf(!hasFixtures)("row semantics against the phase 0 captures", () => {
  it("resolves the batched notifycliententerview of the TS6 session", () => {
    const text = capturedCommands("ts6ServerSession.json").find((command) => command.startsWith("notifycliententerview"))!;
    const { rows } = parseCommand(text);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.cfid, row.ctid, row.reasonid, row.clid])).toEqual([
      ["0", "1", "2", "129"],
      ["0", "1", "2", "133"],
    ]);
    // Apart from the shared fields both rows carry the same complete field set.
    expect(Object.keys(rows[1]).sort()).toEqual(Object.keys(rows[0]).sort());
    expect(rows[0].client_database_id).toBe("111");
    expect(rows[1].client_database_id).toBe("3");
  });

  it("finds no other field that only the first row carries, in either session", () => {
    for (const file of ["ts3ServerSession.json", "ts6ServerSession.json"]) {
      for (const text of capturedCommands(file)) {
        const segments = splitCommandRows(text);
        if (segments.length < 2) continue;
        const name = text.split(" ")[0];
        const keysOf = (segment: string) =>
          new Set(
            segment
              .split(" ")
              .filter((token) => token && token !== name)
              .map((token) => token.split("=")[0]),
          );
        const first = keysOf(segments[0]);
        const later = segments.slice(1).map(keysOf);
        const sharedOnly = [...first].filter((key) => later.some((keys) => !keys.has(key)));
        const expected =
          name === "notifycliententerview"
            ? ["cfid", "ctid", "reasonid"]
            : name === "notifyeffectivepermissions"
              ? ["cldbid", "cid", "return_code"]
              : [];
        expect(sharedOnly, `${file} ${name}`).toEqual(expected);
        for (const keys of later) for (const key of keys) expect(first.has(key), `${file} ${name} ${key}`).toBe(true);
      }
    }
  });
});
