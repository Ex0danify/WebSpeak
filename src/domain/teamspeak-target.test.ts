import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEAM_SPEAK_PORT,
  InvalidTeamSpeakTargetError,
  formatTeamSpeakTarget,
  parseTeamSpeakTarget,
  parseTeamSpeakTargetParts,
  teamSpeakTargetKey,
} from "./teamspeak-target.js";
import { ACCEPTED_TARGETS } from "../../test/helpers/teamspeak-target-cases.js";

describe("parseTeamSpeakTarget", () => {
  it.each(ACCEPTED_TARGETS)("accepts %s", (input, expected) => {
    expect(parseTeamSpeakTarget(input)).toEqual(expected);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["a bare IPv6 address (needs brackets)", "::1"],
    ["a bare IPv6 address with a port", "2001:db8::1:9987"],
    ["an unclosed bracket", "[::1"],
    ["junk after the bracket", "[::1]x9987"],
    ["two # separators", "example.com#1#2"],
    ["a non-hex IPv6 group", "[zz::1]"],
    ["a dotted IPv4-mapped IPv6 address (fails closed; the hex form is accepted)", "[::ffff:10.0.0.1]"],
    ["an empty host", ":9987"],
    ["an empty host with #", "#9987"],
    ["an empty port", "example.com:"],
    ["a non-numeric port", "example.com:abc"],
    ["a signed port", "example.com:+9987"],
    ["a decimal port", "example.com:99.87"],
    ["a hex port", "example.com:0x26e3"],
    ["port 0", "example.com:0"],
    ["port 65536", "example.com:65536"],
    ["a URL scheme", "http://example.com"],
    ["a path", "example.com/path"],
    ["userinfo", "user@example.com"],
    ["a query", "example.com?x=1"],
    ["a backslash", "example.com\\x"],
    ["whitespace inside the host", "exa mple.com"],
    ["a host with unicode", "exämple.com"],
    ["a host longer than 255 characters", `${"a".repeat(256)}.com`],
  ])("rejects %s", (_name, input) => {
    expect(() => parseTeamSpeakTarget(input)).toThrow(InvalidTeamSpeakTargetError);
  });

  it("uses the fallback port only when none is given", () => {
    expect(parseTeamSpeakTarget("example.com", 1234).port).toBe(1234);
    expect(parseTeamSpeakTarget("[::1]", 1234).port).toBe(1234);
    expect(parseTeamSpeakTarget("example.com:5", 1234).port).toBe(5);
  });

  it("exposes 9987 as the default TeamSpeak port", () => {
    expect(DEFAULT_TEAM_SPEAK_PORT).toBe(9987);
  });

  it("says why an empty address was refused", () => {
    expect(() => parseTeamSpeakTarget("")).toThrow("required");
  });
});

describe("parseTeamSpeakTargetParts", () => {
  it.each([
    [["example.com", "9988"], { host: "example.com", port: 9988 }],
    [["example.com", 9988], { host: "example.com", port: 9988 }],
    [["example.com"], { host: "example.com", port: 9987 }],
    [["example.com", ""], { host: "example.com", port: 9987 }],
    [["example.com", "  "], { host: "example.com", port: 9987 }],
    [["example.com:9988"], { host: "example.com", port: 9988 }],
    [["[::1]", 9988], { host: "::1", port: 9988 }],
    [["::1", 9988], { host: "::1", port: 9988 }],
    [["[::1]:9988"], { host: "::1", port: 9988 }],
  ] as const)("accepts %j", (args, expected) => {
    expect(parseTeamSpeakTargetParts(...(args as [string, (string | number)?]))).toEqual(expected);
  });

  it("rejects a port in both the host and the port field", () => {
    expect(() => parseTeamSpeakTargetParts("example.com:9987", 9988)).toThrow(InvalidTeamSpeakTargetError);
  });

  it("rejects an empty host, even with a port", () => {
    expect(() => parseTeamSpeakTargetParts("  ", 9987)).toThrow("required");
  });

  it("validates the separate port", () => {
    expect(() => parseTeamSpeakTargetParts("example.com", "70000")).toThrow(InvalidTeamSpeakTargetError);
    expect(() => parseTeamSpeakTargetParts("example.com", "x")).toThrow(InvalidTeamSpeakTargetError);
  });
});

describe("formatTeamSpeakTarget", () => {
  it("formats a hostname as host:port", () => {
    expect(formatTeamSpeakTarget({ host: "example.com", port: 9987 })).toBe("example.com:9987");
  });

  it("brackets IPv6 hosts", () => {
    expect(formatTeamSpeakTarget({ host: "2001:db8::1", port: 9987 })).toBe("[2001:db8::1]:9987");
  });

  it("round-trips through the parser", () => {
    for (const input of ["example.com:9988", "10.0.0.1:1", "[2001:db8::1]:65535"]) {
      expect(formatTeamSpeakTarget(parseTeamSpeakTarget(input))).toBe(input);
    }
  });
});

describe("teamSpeakTargetKey", () => {
  it("is case-insensitive so one identity maps to one target", () => {
    expect(teamSpeakTargetKey({ host: "Example.COM", port: 9987 })).toBe("example.com:9987");
  });

  it("is the same for every spelling of one target", () => {
    const keys = ["Example.com", "example.com:9987", "EXAMPLE.COM#9987"].map((input) =>
      teamSpeakTargetKey(parseTeamSpeakTarget(input)),
    );
    expect(new Set(keys).size).toBe(1);
  });

  it("differs by port and by host", () => {
    const base = teamSpeakTargetKey({ host: "a.example", port: 9987 });
    expect(teamSpeakTargetKey({ host: "a.example", port: 9988 })).not.toBe(base);
    expect(teamSpeakTargetKey({ host: "b.example", port: 9987 })).not.toBe(base);
  });

  it("keeps IPv6 hosts distinct from a hostname with the same text", () => {
    expect(teamSpeakTargetKey({ host: "::1", port: 9987 })).toBe("[::1]:9987");
  });
});
