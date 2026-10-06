import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { resolveClientIp, resolveWebRtcPublicHost } from "./voiceRequestInfo.js";

function request(headers: IncomingMessage["headers"], remoteAddress?: string): IncomingMessage {
  return { headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe("resolveWebRtcPublicHost", () => {
  it.each([
    ["origin wins over forwarded host and host", { origin: "https://a.example:8443", "x-forwarded-host": "b.example", host: "c.example" }, "a.example"],
    ["forwarded host wins over host", { "x-forwarded-host": "b.example:3040", host: "c.example" }, "b.example"],
    ["host is the last fallback", { host: "c.example:3040" }, "c.example"],
    ["origin \"null\" is skipped", { origin: "null", host: "c.example" }, "c.example"],
    ["first entry of a comma list", { "x-forwarded-host": "b.example, proxy.example" }, "b.example"],
    ["unparseable origin falls through", { origin: "http://", host: "c.example" }, "c.example"],
    ["ipv6 literal keeps brackets", { host: "[::1]:3040" }, "[::1]"],
    ["nothing usable", {}, undefined],
  ] as const)("%s", (_name, headers, expected) => {
    expect(resolveWebRtcPublicHost(request({ ...headers }))).toBe(expected);
  });
});

describe("resolveClientIp", () => {
  it.each([
    ["first x-forwarded-for entry", { "x-forwarded-for": "203.0.113.5, 10.0.0.1" }, "10.0.0.2", "203.0.113.5"],
    ["x-real-ip when forwarded-for is invalid", { "x-forwarded-for": "garbage", "x-real-ip": "198.51.100.7" }, "10.0.0.2", "198.51.100.7"],
    ["socket address as last resort", {}, "10.0.0.2", "10.0.0.2"],
    ["bracketed ipv6", { "x-real-ip": "[2001:db8::1]" }, undefined, "2001:db8::1"],
    ["ipv4-mapped ipv6 is unwrapped", {}, "::ffff:192.0.2.9", "192.0.2.9"],
    ["array header uses first value", { "x-forwarded-for": ["203.0.113.5", "203.0.113.6"] }, undefined, "203.0.113.5"],
    ["unknown when nothing is valid", { "x-forwarded-for": "nope" }, undefined, "unknown"],
  ] as const)("%s", (_name, headers, remote, expected) => {
    expect(resolveClientIp(request({ ...headers } as IncomingMessage["headers"], remote))).toBe(expected);
  });
});
