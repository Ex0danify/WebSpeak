import { describe, expect, it } from "vitest";
import { Fuzzer, forSeeds } from "../../../../test/support/fuzz.js";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { escapeCommandValue, unescapeCommandValue } from "./commandEscape.js";
import { splitCommandRows } from "./commandRows.js";
import { buildCommand, parseCommand } from "./commandText.js";
import { parseBool, parseI32, parseList, parseU16, parseU32, parseU64, parseU8 } from "./commandValues.js";

const ITERATIONS = 3000;

// Anything the server can put on the wire must leave the parser with a result or a typed
// malformedData error, never an unexpected throw and never a hang.
const parsingOnlyThrows = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error, "parsers reject only with TeamSpeakTransportError").toBeInstanceOf(TeamSpeakTransportError);
  }
};

describe("wire parser fuzzing", () => {
  it("parseCommand survives arbitrary and mutated-valid text", () => {
    const seed = buildCommand("notifycliententerview", { clid: 7, client_nickname: "a b|c" }, { flags: ["uid"] });
    forSeeds(ITERATIONS, (fuzz) => {
      const nameless = fuzz.chance(0.5);
      parsingOnlyThrows(() => parseCommand(fuzz.string(80), { nameless }));
      parsingOnlyThrows(() => parseCommand(fuzz.mutate(Buffer.from(seed)).toString("latin1"), { nameless }));
    });
  });

  it("splitCommandRows honours its row limit and never throws otherwise", () => {
    forSeeds(ITERATIONS, (fuzz) => {
      const maxRows = 1 + fuzz.int(8);
      try {
        const rows = splitCommandRows(fuzz.string(60), maxRows);
        expect(rows.length).toBeLessThanOrEqual(maxRows);
      } catch (error) {
        expect(error).toBeInstanceOf(TeamSpeakTransportError);
      }
    });
  });

  it("unescape reverses escape for any string", () => {
    forSeeds(ITERATIONS, (fuzz) => {
      const value = fuzz.string(60);
      expect(unescapeCommandValue(escapeCommandValue(value))).toBe(value);
    });
  });

  it("value parsers return undefined or an in-range value, never throw", () => {
    forSeeds(ITERATIONS, (fuzz) => {
      const text = fuzz.chance(0.5) ? fuzz.string(40) : String(fuzz.int(2 ** 31));
      const check = (value: number | undefined, min: number, max: number) => {
        if (value !== undefined) expect(value >= min && value <= max).toBe(true);
      };
      check(parseU8(text), 0, 0xff);
      check(parseU16(text), 0, 0xffff);
      check(parseU32(text), 0, 0xffff_ffff);
      check(parseI32(text), -0x8000_0000, 0x7fff_ffff);
      const u64 = parseU64(text);
      if (u64 !== undefined) expect(u64 >= 0n && u64 <= 0xffff_ffff_ffff_ffffn).toBe(true);
      expect([true, false, undefined]).toContain(parseBool(text));
      const list = parseList(text, parseU16);
      if (list !== undefined) expect(Array.isArray(list)).toBe(true);
    });
  });

  it("a built command always parses back", () => {
    forSeeds(ITERATIONS, (fuzz) => {
      const text = buildCommand("clientmove", { clid: fuzz.int(0xffff), cid: fuzz.int(0xffff), cpw: fuzz.string(12) });
      const parsed = parseCommand(text);
      expect(parsed.name).toBe("clientmove");
    });
  });
});

// The fuzzer itself must be deterministic, or a "failing seed" means nothing.
describe("Fuzzer", () => {
  it("produces the same stream for the same seed", () => {
    expect(new Fuzzer(42).randomBytes(64).equals(new Fuzzer(42).randomBytes(64))).toBe(true);
  });
});
