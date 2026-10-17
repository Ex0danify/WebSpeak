import { describe, expect, it } from "vitest";
import { parseBool, parseI32, parseList, parseU16, parseU32, parseU64, parseU8 } from "./commandValues.js";

describe("integer parsers", () => {
  it("parse values inside their range", () => {
    expect(parseU8("255")).toBe(255);
    expect(parseU16("0")).toBe(0);
    expect(parseU16("65535")).toBe(65535);
    expect(parseU32("4294967295")).toBe(4294967295);
    expect(parseI32("-2147483648")).toBe(-2147483648);
    expect(parseI32("2147483647")).toBe(2147483647);
    expect(parseU16("007")).toBe(7);
  });

  it("turn -0 into 0", () => {
    expect(Object.is(parseI32("-0"), 0)).toBe(true);
  });

  it("return undefined outside the range", () => {
    expect(parseU8("256")).toBeUndefined();
    expect(parseU16("65536")).toBeUndefined();
    expect(parseU32("4294967296")).toBeUndefined();
    expect(parseI32("2147483648")).toBeUndefined();
    expect(parseI32("-2147483649")).toBeUndefined();
  });

  it.each([undefined, "", " 1", "1 ", "+1", "-1", "1.0", "1e3", "0x10", "abc", "1".repeat(33)])("reject %j as unsigned", (text) => {
    expect(parseU16(text)).toBeUndefined();
    expect(parseU64(text)).toBeUndefined();
  });

  it.each(["", "-", "--1", "1-", "- 1"])("reject %j as signed", (text) => {
    expect(parseI32(text)).toBeUndefined();
  });
});

describe("parseU64", () => {
  it("parses the full range as bigint", () => {
    expect(parseU64("0")).toBe(0n);
    expect(parseU64("18446744073709551615")).toBe(18446744073709551615n);
    expect(parseU64("00018446744073709551615")).toBe(18446744073709551615n);
  });

  it("returns undefined above 2^64-1", () => {
    expect(parseU64("18446744073709551616")).toBeUndefined();
  });
});

describe("parseBool", () => {
  it("knows only 0 and 1", () => {
    expect(parseBool("1")).toBe(true);
    expect(parseBool("0")).toBe(false);
    for (const text of [undefined, "", "2", "true", "01"]) expect(parseBool(text)).toBeUndefined();
  });
});

describe("parseList", () => {
  it("parses comma separated items", () => {
    expect(parseList("6,7,10", parseU32)).toEqual([6, 7, 10]);
    expect(parseList("6", parseU64)).toEqual([6n]);
  });

  it("treats an empty string as the empty list and a missing value as undefined", () => {
    expect(parseList("", parseU32)).toEqual([]);
    expect(parseList(undefined, parseU32)).toBeUndefined();
  });

  it("returns undefined when one item is bad", () => {
    expect(parseList("6,x", parseU32)).toBeUndefined();
    expect(parseList("6,,7", parseU32)).toBeUndefined();
    expect(parseList("6,", parseU32)).toBeUndefined();
  });
});
