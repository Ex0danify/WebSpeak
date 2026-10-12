import { describe, expect, it } from "vitest";
import { EndpointProtocolCache, detectTeamSpeakProtocol } from "./teamSpeakAdapter.js";

const TTL = 30 * 60 * 1000;

function target(host: string, port = 9987) {
  return { host, port };
}

describe("EndpointProtocolCache", () => {
  it("returns nothing for an unknown target", () => {
    expect(new EndpointProtocolCache().get(target("ts.example"))).toBeUndefined();
  });

  it("remembers the protocol per host and port", () => {
    const cache = new EndpointProtocolCache();
    cache.set(target("a.example"), "ts6", 0);
    cache.set(target("a.example", 9988), "ts3", 0);
    expect(cache.get(target("a.example"), 1)).toBe("ts6");
    expect(cache.get(target("a.example", 9988), 1)).toBe("ts3");
    expect(cache.get(target("b.example"), 1)).toBeUndefined();
  });

  it("matches hosts case-insensitively", () => {
    const cache = new EndpointProtocolCache();
    cache.set(target("TS.Example"), "ts6", 0);
    expect(cache.get(target("ts.example"), 1)).toBe("ts6");
    expect(cache.size).toBe(1);
  });

  it("keeps an entry for exactly the ttl and drops it one millisecond later", () => {
    const cache = new EndpointProtocolCache();
    cache.set(target("ts.example"), "ts6", 1_000);
    expect(cache.get(target("ts.example"), 1_000 + TTL)).toBe("ts6");
    expect(cache.get(target("ts.example"), 1_000 + TTL + 1)).toBeUndefined();
  });

  it("removes an expired entry when it is read", () => {
    const cache = new EndpointProtocolCache();
    cache.set(target("ts.example"), "ts6", 0);
    expect(cache.get(target("ts.example"), TTL + 1)).toBeUndefined();
    expect(cache.size).toBe(0);
    expect(cache.get(target("ts.example"), 0)).toBeUndefined();
  });

  it("uses a custom ttl", () => {
    const cache = new EndpointProtocolCache(100);
    cache.set(target("ts.example"), "ts3", 0);
    expect(cache.get(target("ts.example"), 100)).toBe("ts3");
    expect(cache.get(target("ts.example"), 101)).toBeUndefined();
  });

  it("replaces the protocol and restarts the ttl when a target is set again", () => {
    const cache = new EndpointProtocolCache(100);
    cache.set(target("ts.example"), "ts3", 0);
    cache.set(target("ts.example"), "ts6", 90);
    expect(cache.size).toBe(1);
    expect(cache.get(target("ts.example"), 150)).toBe("ts6");
  });

  it("holds at most 128 entries by default and evicts the oldest", () => {
    const cache = new EndpointProtocolCache();
    for (let i = 0; i < 129; i += 1) cache.set(target(`host${i}.example`), "ts6", i);
    expect(cache.size).toBe(128);
    expect(cache.get(target("host0.example"), 200)).toBeUndefined();
    expect(cache.get(target("host1.example"), 200)).toBe("ts6");
    expect(cache.get(target("host128.example"), 200)).toBe("ts6");
  });

  it("counts a target that is set again as newest, so it outlives older ones", () => {
    const cache = new EndpointProtocolCache(TTL, 3);
    cache.set(target("a.example"), "ts6", 0);
    cache.set(target("b.example"), "ts6", 1);
    cache.set(target("c.example"), "ts6", 2);
    cache.set(target("a.example"), "ts3", 3);
    cache.set(target("d.example"), "ts6", 4);
    expect(cache.get(target("b.example"), 5)).toBeUndefined();
    expect(cache.get(target("a.example"), 5)).toBe("ts3");
    expect(cache.size).toBe(3);
  });

  it("evicts by time of last set, not by time of last read", () => {
    const cache = new EndpointProtocolCache(TTL, 2);
    cache.set(target("a.example"), "ts6", 0);
    cache.set(target("b.example"), "ts6", 1);
    expect(cache.get(target("a.example"), 2)).toBe("ts6");
    cache.set(target("c.example"), "ts6", 3);
    expect(cache.get(target("a.example"), 4)).toBeUndefined();
    expect(cache.get(target("b.example"), 4)).toBe("ts6");
  });

  it("clear empties the cache", () => {
    const cache = new EndpointProtocolCache();
    cache.set(target("a.example"), "ts6", 0);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get(target("a.example"), 1)).toBeUndefined();
  });
});

describe("detectTeamSpeakProtocol", () => {
  it.each([
    ["TeamSpeak 6 Server", "ts6"],
    ["teamspeak6", "ts6"],
    ["6.0.0-beta8 1739000000 Linux", "ts6"],
    ["version 6.1", "ts6"],
    ["TeamSpeak 3 Server", "ts3"],
    ["3.13.7 1655727713 Linux", "ts3"],
    ["  TEAMSPEAK 3  ", "ts3"],
    ["", null],
    ["   ", null],
    ["Linux", null],
    ["16.2", null],
    ["v36.2", null],
    ["2.4.1", null],
  ] as const)("reads %j as %s", (text, expected) => {
    expect(detectTeamSpeakProtocol(text)).toBe(expected);
  });

  it("prefers ts6 when both generations are named", () => {
    expect(detectTeamSpeakProtocol("TeamSpeak 3 compatible, TeamSpeak 6 server")).toBe("ts6");
  });

  it("finds the version anywhere in the joined command output", () => {
    expect(detectTeamSpeakProtocol("build 1655727713 platform Linux version 3.13.7")).toBe("ts3");
  });

  // A ".6.x" component inside a TS3 version is not a TS6 version.
  it("reads a TS3 server version such as 3.6.1 as ts3", () => {
    expect(detectTeamSpeakProtocol("3.6.1 1568900000 Linux")).toBe("ts3");
    expect(detectTeamSpeakProtocol("TeamSpeak 3.6.1")).toBe("ts3");
    expect(detectTeamSpeakProtocol("version=3.6.1 platform=Linux")).toBe("ts3");
  });

  it("still reads a bare 6.x version as ts6", () => {
    expect(detectTeamSpeakProtocol("6.0.0-beta13.1 Linux")).toBe("ts6");
    expect(detectTeamSpeakProtocol("version=6.0.0")).toBe("ts6");
  });
});
