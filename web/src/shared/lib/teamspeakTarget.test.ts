import { describe, expect, it } from "vitest";
import { formatTeamSpeakTarget, parseTeamSpeakTarget, teamSpeakTargetKey } from "@/../../src/shared/teamSpeakTarget";
import { ACCEPTED_TARGETS, PORT_FIELD_CASES } from "@/../../test/support/teamSpeakTargetCases";
import { DEFAULT_TEAM_SPEAK_PORT, combineTeamSpeakTarget, isValidTeamSpeakPort, splitTeamSpeakTarget } from "./teamspeakTarget";

// The gateway validates a target, the form only splits and joins it. Both are run
// against the table of test/support/teamSpeakTargetCases.ts, so a change to one
// parser that the other does not follow shows up here.
describe("agreement with the gateway parser", () => {
  it.each(ACCEPTED_TARGETS)("%s is the same server on both sides", (input, expected) => {
    const fields = splitTeamSpeakTarget(input);
    // The form keeps the case the user typed; the gateway lower-cases.
    expect(fields.address.toLowerCase()).toBe(expected.host);
    expect(fields.port).toBe(String(expected.port));
    expect(combineTeamSpeakTarget(fields.address, fields.port).toLowerCase()).toBe(teamSpeakTargetKey(parseTeamSpeakTarget(input)));
  });

  it.each(ACCEPTED_TARGETS)("the joined value of %s is accepted by the gateway as it is", (input) => {
    const { address, port } = splitTeamSpeakTarget(input);
    const joined = combineTeamSpeakTarget(address, port);
    expect(formatTeamSpeakTarget(parseTeamSpeakTarget(joined))).toBe(joined.toLowerCase());
  });

  it.each(PORT_FIELD_CASES)("port field %j: valid = %s on both sides", (value, valid) => {
    expect(isValidTeamSpeakPort(value)).toBe(valid);
    const gatewayAccepts = () => parseTeamSpeakTarget(`example.com:${value}`);
    if (valid) expect(gatewayAccepts).not.toThrow();
    else expect(gatewayAccepts).toThrow();
  });

  it("uses the same default port", () => {
    expect(DEFAULT_TEAM_SPEAK_PORT).toBe("9987");
    expect(splitTeamSpeakTarget("example.com").port).toBe(String(parseTeamSpeakTarget("example.com").port));
  });
});

describe("splitTeamSpeakTarget", () => {
  it.each([undefined, null, 42, {}, "", "   "])("returns an empty address with the default port for %j", (value) => {
    expect(splitTeamSpeakTarget(value)).toEqual({ address: "", port: "9987" });
  });

  it("uses the fallback port when the target has none", () => {
    expect(splitTeamSpeakTarget("example.com", "1234")).toEqual({ address: "example.com", port: "1234" });
    expect(splitTeamSpeakTarget("", "1234")).toEqual({ address: "", port: "1234" });
    expect(splitTeamSpeakTarget("example.com:5", "1234")).toEqual({ address: "example.com", port: "5" });
  });

  it("keeps the case the user typed", () => {
    expect(splitTeamSpeakTarget("Example.COM:1")).toEqual({ address: "Example.COM", port: "1" });
  });

  it("takes a bracketed IPv6 address without its brackets, with or without a port", () => {
    expect(splitTeamSpeakTarget("[2001:db8::1]:9988")).toEqual({ address: "2001:db8::1", port: "9988" });
    expect(splitTeamSpeakTarget("[2001:db8::1]")).toEqual({ address: "2001:db8::1", port: "9987" });
    expect(splitTeamSpeakTarget("[2001:db8::1]#9988")).toEqual({ address: "2001:db8::1", port: "9988" });
  });

  // Not the gateway's job to be strict: the form splits whatever was typed, and the
  // gateway refuses what is wrong. These pin what the form does with such input.
  it.each([
    ["a bare IPv6 address stays whole", "2001:db8::1", { address: "2001:db8::1", port: "9987" }],
    ["a port of 0 is not a port", "example.com:0", { address: "example.com:0", port: "9987" }],
    ["a port above 65535 is not a port", "example.com:65536", { address: "example.com:65536", port: "9987" }],
    ["a text after the colon is not a port", "example.com:abc", { address: "example.com:abc", port: "9987" }],
    ["an unclosed bracket stays whole", "[::1", { address: "[::1", port: "9987" }],
    ["a bad port after brackets falls back", "[::1]:abc", { address: "::1", port: "9987" }],
    ["the last # wins", "a#1#2", { address: "a#1", port: "2" }],
  ])("%s", (_name, input, expected) => {
    expect(splitTeamSpeakTarget(input)).toEqual(expected);
  });
});

describe("combineTeamSpeakTarget", () => {
  it.each([
    ["example.com", "9988", "example.com:9988"],
    ["  example.com  ", " 9988 ", "example.com:9988"],
    ["example.com", "", "example.com:9987"],
    ["example.com", "   ", "example.com:9987"],
    ["2001:db8::1", "9988", "[2001:db8::1]:9988"],
    ["[2001:db8::1]", "9988", "[2001:db8::1]:9988"],
    ["", "9988", ""],
    ["   ", "9988", ""],
    ["[]", "9988", ""],
  ])("(%j, %j) gives %j", (address, port, expected) => {
    expect(combineTeamSpeakTarget(address, port)).toBe(expected);
  });

  it("does not validate the port, that is isValidTeamSpeakPort's job", () => {
    expect(combineTeamSpeakTarget("example.com", "abc")).toBe("example.com:abc");
  });
});

describe("isValidTeamSpeakPort", () => {
  it("accepts 1 to 65535 with surrounding spaces and rejects everything else", () => {
    expect(isValidTeamSpeakPort("1")).toBe(true);
    expect(isValidTeamSpeakPort(" 65535 ")).toBe(true);
    for (const value of ["0", "65536", "", " ", "1e3", "1_000", "٣"]) expect(isValidTeamSpeakPort(value)).toBe(false);
  });
});
