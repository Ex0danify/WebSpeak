import { describe, expect, it } from "vitest";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { buildCommand, parseCommand } from "./commandText.js";

describe("parseCommand", () => {
  it("parses a name without parameters", () => {
    expect(parseCommand("channellistfinished")).toEqual({ name: "channellistfinished", flags: [], rows: [{}] });
  });

  it("parses values, bare keys and an = inside a value", () => {
    const parsed = parseCommand("initivexpand2 l=AQBg+/== beta=x omega=AQ== ot=1 client_meta_data tvd=");
    expect(parsed.name).toBe("initivexpand2");
    expect(parsed.rows).toEqual([{ l: "AQBg+/==", beta: "x", omega: "AQ==", ot: "1", client_meta_data: "", tvd: "" }]);
  });

  it("unescapes values", () => {
    expect(parseCommand("initserver virtualserver_name=Ju:nien\\sof\\p\\/x").rows[0].virtualserver_name).toBe("Ju:nien of|/x");
  });

  it("collects flags", () => {
    expect(parseCommand("clientlist -uid -away -voice -groups")).toEqual({
      name: "clientlist",
      flags: ["uid", "away", "voice", "groups"],
      rows: [{}],
    });
  });

  it("takes a leading key=value as the start of a nameless answer row", () => {
    const parsed = parseCommand("cid=1 client_nickname=a|cid=2 client_nickname=b");
    expect(parsed.name).toBeUndefined();
    expect(parsed.rows).toEqual([
      { cid: "1", client_nickname: "a" },
      { cid: "2", client_nickname: "b" },
    ]);
  });

  it("reads a leading bare key as a key when told the row is nameless", () => {
    expect(parseCommand("client_meta_data cid=1", { nameless: true })).toEqual({
      name: undefined,
      flags: [],
      rows: [{ client_meta_data: "", cid: "1" }],
    });
    expect(parseCommand("client_meta_data cid=1").name).toBe("client_meta_data");
  });

  it("ignores repeated spaces and empty rows", () => {
    expect(parseCommand("x  a=1   b=2||c=3|").rows).toEqual([
      { a: "1", b: "2" },
      { a: "1", b: "2", c: "3" },
    ]);
  });

  it("keeps the last value of a repeated key", () => {
    expect(parseCommand("x a=1 a=2").rows[0].a).toBe("2");
  });

  it("does not choke on replacement characters from invalid UTF-8", () => {
    expect(parseCommand("updatemytsdata myts_certificate=��\u0001").rows[0].myts_certificate).toBe("��\u0001");
  });

  it("stores keys like __proto__ as plain data", () => {
    const row = parseCommand("x __proto__=1 constructor=2").rows[0];
    expect(Object.getPrototypeOf(row)).toBeNull();
    expect(row["__proto__"]).toBe("1");
    expect(row.constructor).toBe("2");
  });

  it("rejects an empty command and a value without a key", () => {
    for (const text of ["", "   ", "|", " | "]) expect(() => parseCommand(text)).toThrow(TeamSpeakTransportError);
    expect(() => parseCommand("x =1")).toThrow(/without a key/);
  });

  it("rejects more rows than allowed", () => {
    expect(() => parseCommand("a=1|a=2|a=3", { maxRows: 2 })).toThrow(/more than 2 rows/);
    try {
      parseCommand("a=1|a=2|a=3", { maxRows: 2 });
    } catch (error) {
      expect((error as TeamSpeakTransportError).code).toBe("malformedData");
    }
    expect(parseCommand("a=1|a=2", { maxRows: 2 }).rows).toHaveLength(2);
  });

  it("round trips what buildCommand writes", () => {
    const message = `tab\there, pipe| slash/ back\\ ${String.fromCodePoint(0x4f60, 0x1f600)}`;
    const text = buildCommand(
      "sendtextmessage",
      { targetmode: 2, msg: message, empty: "", bare: null },
      { rows: [{ targetmode: 3 }], flags: ["x"] },
    );
    expect(parseCommand(text)).toEqual({
      name: "sendtextmessage",
      flags: ["x"],
      rows: [
        { targetmode: "2", msg: message, empty: "", bare: "" },
        { targetmode: "3", msg: message, empty: "", bare: "" },
      ],
    });
  });
});
