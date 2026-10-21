import { describe, expect, it } from "vitest";
import { buildCommand } from "./commandText.js";

describe("buildCommand", () => {
  it("writes a bare name", () => {
    expect(buildCommand("channelsubscribeall")).toBe("channelsubscribeall");
  });

  it("keeps the parameter order and escapes values", () => {
    expect(buildCommand("sendtextmessage", { targetmode: 2, target: 1, msg: "hi | there/x" })).toBe(
      "sendtextmessage targetmode=2 target=1 msg=hi\\s\\p\\sthere\\/x",
    );
    expect(
      buildCommand("clientmove", [
        ["clid", 5],
        ["cid", 7],
      ]),
    ).toBe("clientmove clid=5 cid=7");
  });

  it("formats numbers, bigints and booleans", () => {
    expect(buildCommand("x", { a: 0, b: -1, c: 18446744073709551615n, d: true, e: false, f: 1.5 })).toBe(
      "x a=0 b=-1 c=18446744073709551615 d=1 e=0 f=1.5",
    );
  });

  it("writes null as a bare key and leaves undefined out", () => {
    expect(buildCommand("clientinit", { client_nickname: "n", client_default_channel: null, cpw: undefined })).toBe(
      "clientinit client_nickname=n client_default_channel",
    );
  });

  it("writes an empty string as key=", () => {
    expect(buildCommand("clientupdate", { client_away_message: "" })).toBe("clientupdate client_away_message=");
  });

  it("puts flags at the end, with or without the dash", () => {
    expect(buildCommand("clientlist", {}, { flags: ["uid", "-away", "voice", "groups"] })).toBe("clientlist -uid -away -voice -groups");
    expect(buildCommand("clientinfo", { clid: 3 }, { flags: ["uid"] })).toBe("clientinfo clid=3 -uid");
  });

  it("joins further rows with pipes", () => {
    expect(buildCommand("permeffective", { cldbid: 3, cid: 1, permid: 252 }, { rows: [{ permid: 253 }, { permid: 254 }] })).toBe(
      "permeffective cldbid=3 cid=1 permid=252|permid=253|permid=254",
    );
  });

  it("rejects names, keys and flags that would break the command", () => {
    expect(() => buildCommand("bad name")).toThrow(TypeError);
    expect(() => buildCommand("")).toThrow(TypeError);
    expect(() => buildCommand("x", { "a=b": 1 })).toThrow(TypeError);
    expect(() => buildCommand("x", { "a|b": 1 })).toThrow(TypeError);
    expect(() => buildCommand("x", {}, { flags: ["a b"] })).toThrow(TypeError);
    expect(() => buildCommand("x", {}, { rows: [{ "": 1 }] })).toThrow(TypeError);
  });

  it("rejects non-finite numbers", () => {
    expect(() => buildCommand("x", { a: Number.NaN })).toThrow(/not finite/);
    expect(() => buildCommand("x", { a: Number.POSITIVE_INFINITY })).toThrow(/not finite/);
  });
});
