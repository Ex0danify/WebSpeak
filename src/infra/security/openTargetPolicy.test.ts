import { beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));

import {
  UnsafeTeamSpeakTargetError,
  assertSafeOpenTarget,
  isRestrictedAddress,
  resolveSafeOpenTarget,
} from "./openTargetPolicy.js";

// Addresses a public gateway must never connect to on a visitor's behalf.
const BLOCKED_IPV4 = [
  ["this network", "0.0.0.0"],
  ["this network", "0.255.255.255"],
  ["private 10/8", "10.0.0.1"],
  ["private 10/8", "10.255.255.255"],
  ["carrier-grade NAT 100.64/10", "100.64.0.1"],
  ["carrier-grade NAT 100.64/10", "100.127.255.255"],
  ["loopback", "127.0.0.1"],
  ["loopback", "127.255.255.254"],
  ["link-local (cloud metadata)", "169.254.169.254"],
  ["private 172.16/12", "172.16.0.1"],
  ["private 172.16/12", "172.31.255.255"],
  ["IETF protocol assignments 192.0.0/24", "192.0.0.1"],
  ["documentation 192.0.2/24", "192.0.2.10"],
  ["private 192.168/16", "192.168.1.1"],
  ["benchmarking 198.18/15", "198.18.0.1"],
  ["benchmarking 198.18/15", "198.19.255.255"],
  ["documentation 198.51.100/24", "198.51.100.7"],
  ["documentation 203.0.113/24", "203.0.113.7"],
  ["multicast", "224.0.0.1"],
  ["multicast", "239.255.255.255"],
  ["reserved 240/4", "240.0.0.1"],
  ["broadcast", "255.255.255.255"],
] as const;

const ALLOWED_IPV4 = [
  "1.1.1.1",
  "8.8.8.8",
  "9.255.255.255", // just below 10/8
  "11.0.0.1", // just above 10/8
  "100.63.255.255", // just below 100.64/10
  "100.128.0.1", // just above 100.64/10
  "126.255.255.255", // just below 127/8
  "128.0.0.1", // just above 127/8
  "169.253.0.1", // next to link-local
  "169.255.0.1",
  "172.15.255.255", // just below 172.16/12
  "172.32.0.1", // just above 172.16/12
  "192.167.255.255",
  "192.169.0.1",
  "198.17.255.255",
  "198.20.0.1",
  "198.51.99.1",
  "198.51.101.1",
  "203.0.112.1",
  "203.0.114.1",
  "223.255.255.255", // just below multicast
] as const;

describe("isRestrictedAddress: IPv4", () => {
  it.each(BLOCKED_IPV4)("blocks %s (%s)", (_range, address) => {
    expect(isRestrictedAddress(address)).toBe(true);
  });

  it.each(ALLOWED_IPV4)("allows public %s", (address) => {
    expect(isRestrictedAddress(address)).toBe(false);
  });

  // F4: only the two reserved /24 blocks of 192.0.0.0/16 are blocked (IETF protocol assignments and
  // documentation); the rest of the /16 is public address space.
  it("F4: allows public addresses in 192.0.0.0/16 outside the two reserved /24 blocks", () => {
    expect(isRestrictedAddress("192.0.1.1")).toBe(false);
    expect(isRestrictedAddress("192.0.3.1")).toBe(false);
    expect(isRestrictedAddress("192.0.255.255")).toBe(false);
  });

  it("F4: blocks the two reserved /24 blocks and allows their neighbours", () => {
    expect(isRestrictedAddress("192.0.0.0")).toBe(true);
    expect(isRestrictedAddress("192.0.0.255")).toBe(true);
    expect(isRestrictedAddress("192.0.2.0")).toBe(true);
    expect(isRestrictedAddress("192.0.2.255")).toBe(true);
    expect(isRestrictedAddress("192.1.0.1")).toBe(false);
  });
});

describe("isRestrictedAddress: IPv6", () => {
  it.each([
    ["unspecified", "::"],
    ["loopback", "::1"],
    ["loopback, upper case", "::1"],
    ["IPv4-compatible", "::7f00:1"],
    ["IPv4-compatible dotted", "::127.0.0.1"],
    ["unique-local fc00::/7", "fc00::1"],
    ["unique-local fd00::/8", "fd12:3456:789a::1"],
    ["link-local fe80::/10", "fe80::1"],
    ["link-local top of range", "febf::1"],
    ["site-local fec0::/10", "fec0::1"],
    ["multicast", "ff02::1"],
    ["documentation 2001:db8::/32", "2001:db8::1"],
    ["documentation, upper case", "2001:DB8::1"],
    ["mapped loopback", "::ffff:127.0.0.1"],
    ["mapped loopback, upper case", "::FFFF:127.0.0.1"],
    ["mapped private", "::ffff:10.1.2.3"],
    ["mapped metadata address", "::ffff:169.254.169.254"],
    ["mapped private in hex form", "::ffff:7f00:1"],
    ["mapped public in hex form (cannot be told apart safely)", "::ffff:808:808"],
  ])("blocks %s (%s)", (_name, address) => {
    expect(isRestrictedAddress(address)).toBe(true);
  });

  it.each([
    ["Google public DNS", "2001:4860:4860::8888"],
    ["Cloudflare", "2606:4700:4700::1111"],
    ["just below fc00::/7", "fbff::1"],
    ["just above fd00::/8", "fe00::1"],
    ["just below fe80::/10", "fe7f::1"],
    ["mapped public", "::ffff:8.8.8.8"],
    ["2001:db9 is not documentation", "2001:db9::1"],
  ])("allows %s (%s)", (_name, address) => {
    expect(isRestrictedAddress(address)).toBe(false);
  });
});

describe("isRestrictedAddress: IPv6 forms that embed an IPv4 address", () => {
  // F3: NAT64 (64:ff9b::/96) and 6to4 (2002::/16) addresses can carry a loopback or private IPv4
  // address, so the embedded address is judged with the IPv4 rules.
  it.each([
    ["NAT64 loopback", "64:ff9b::7f00:1"],
    ["NAT64 private 10/8", "64:ff9b::a00:1"],
    ["NAT64 private 192.168/16, dotted tail", "64:ff9b::192.168.0.1"],
    ["NAT64 link-local, spelled out", "64:ff9b:0:0:0:0:a9fe:a9fe"],
    ["NAT64 local-use prefix", "64:ff9b:1::1"],
    ["6to4 loopback", "2002:7f00:1::"],
    ["6to4 private 10/8", "2002:a00:1::"],
    ["6to4 private 172.16/12 with a subnet and host", "2002:ac10:1:5::9"],
  ])("F3: blocks %s (%s)", (_name, address) => {
    expect(isRestrictedAddress(address)).toBe(true);
  });

  it.each([
    ["NAT64 of a public address", "64:ff9b::808:808"],
    ["NAT64 of a public address, dotted tail", "64:ff9b::8.8.8.8"],
    ["6to4 of a public address", "2002:808:808::1"],
  ])("F3: allows %s (%s)", (_name, address) => {
    expect(isRestrictedAddress(address)).toBe(false);
  });

  it.each([
    ["Teredo", "2001:0:4136:e378:8000:63bf:3fff:fdd2"],
    ["discard-only", "100::1"],
  ])("blocks %s (%s), which tunnel or drop traffic", (_name, address) => {
    expect(isRestrictedAddress(address)).toBe(true);
  });

  it("does not confuse a public 2001 or 100 prefix with the blocked ones", () => {
    expect(isRestrictedAddress("2001:4860:4860::8888")).toBe(false);
    expect(isRestrictedAddress("100:1::1")).toBe(false);
  });
});

describe("isRestrictedAddress: not an address", () => {
  it.each(["", "example.com", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1.2.3.-4", "0x7f.0.0.1", "127.1", "2130706433"])(
    "fails closed for %j",
    (value) => {
      expect(isRestrictedAddress(value)).toBe(true);
    },
  );
});

describe("resolveSafeOpenTarget", () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it("returns a public IP literal without a DNS lookup", async () => {
    await expect(resolveSafeOpenTarget({ host: "8.8.8.8", port: 9987 })).resolves.toEqual({ host: "8.8.8.8", port: 9987 });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a private IP literal without a DNS lookup", async () => {
    await expect(resolveSafeOpenTarget({ host: "10.0.0.5", port: 9987 })).rejects.toBeInstanceOf(UnsafeTeamSpeakTargetError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects an IPv6 loopback literal", async () => {
    await expect(resolveSafeOpenTarget({ host: "::1", port: 9987 })).rejects.toBeInstanceOf(UnsafeTeamSpeakTargetError);
  });

  it("resolves a hostname and returns the validated address, not the name (anti DNS rebinding)", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(resolveSafeOpenTarget({ host: "ts.example", port: 9988 })).resolves.toEqual({
      host: "93.184.216.34",
      port: 9988,
    });
    expect(lookup).toHaveBeenCalledWith("ts.example", { all: true, verbatim: true });
  });

  it("rejects a hostname that resolves to a private address", async () => {
    lookup.mockResolvedValue([{ address: "192.168.0.10", family: 4 }]);
    await expect(resolveSafeOpenTarget({ host: "evil.example", port: 9987 })).rejects.toBeInstanceOf(
      UnsafeTeamSpeakTargetError,
    );
  });

  it("rejects when any one of several records is private (mixed answers)", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(resolveSafeOpenTarget({ host: "mixed.example", port: 9987 })).rejects.toBeInstanceOf(
      UnsafeTeamSpeakTargetError,
    );
  });

  it("rejects a hostname whose only AAAA record is loopback", async () => {
    lookup.mockResolvedValue([{ address: "::1", family: 6 }]);
    await expect(resolveSafeOpenTarget({ host: "v6.example", port: 9987 })).rejects.toBeInstanceOf(
      UnsafeTeamSpeakTargetError,
    );
  });

  it("rejects an empty answer", async () => {
    lookup.mockResolvedValue([]);
    await expect(resolveSafeOpenTarget({ host: "empty.example", port: 9987 })).rejects.toBeInstanceOf(
      UnsafeTeamSpeakTargetError,
    );
  });

  it("lets a DNS failure through as its own error instead of allowing the target", async () => {
    lookup.mockImplementation(async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    });
    await expect(resolveSafeOpenTarget({ host: "nx.example", port: 9987 })).rejects.toThrow("ENOTFOUND");
  });

  it("uses the address the resolver listed first", async () => {
    lookup.mockResolvedValue([
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "1.1.1.1", family: 4 },
    ]);
    await expect(resolveSafeOpenTarget({ host: "dual.example", port: 9987 })).resolves.toEqual({
      host: "2606:4700:4700::1111",
      port: 9987,
    });
  });
});

describe("assertSafeOpenTarget", () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it("resolves for a public target", async () => {
    await expect(assertSafeOpenTarget({ host: "1.1.1.1", port: 9987 })).resolves.toBeUndefined();
  });

  it("rejects with the open-mode message for a blocked target", async () => {
    await expect(assertSafeOpenTarget({ host: "127.0.0.1", port: 9987 })).rejects.toThrow("not allowed in open mode");
  });
});
