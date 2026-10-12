import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { clientRateLimitKey, isHttpsRequest, isProxyTrusted, resolveClientIp } from "./clientIp.js";

function request(headers: IncomingMessage["headers"], remoteAddress?: string, encrypted = false): IncomingMessage {
  return { headers, socket: { remoteAddress, encrypted } } as unknown as IncomingMessage;
}

describe("isProxyTrusted", () => {
  it.each([
    ["1", true],
    ["true", true],
    [" YES ", true],
    ["0", false],
    ["", false],
    [undefined, false],
  ])("%j is %s", (value, expected) => {
    expect(isProxyTrusted({ WEBSPEAK_TRUST_PROXY: value })).toBe(expected);
  });
});

describe("resolveClientIp", () => {
  it("ignores forwarded headers without a trusted proxy", () => {
    const headers = { "x-forwarded-for": "6.6.6.6", "x-real-ip": "6.6.6.7" };
    expect(resolveClientIp(request(headers, "203.0.113.7"), false)).toBe("203.0.113.7");
  });

  it("takes the entry the proxy appended, not the client supplied ones", () => {
    expect(resolveClientIp(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.5" }, "10.0.0.2"), true)).toBe("203.0.113.5");
  });

  it("joins repeated header values before taking the last", () => {
    expect(resolveClientIp(request({ "x-forwarded-for": ["6.6.6.6", "203.0.113.5"] }, "10.0.0.2"), true)).toBe("203.0.113.5");
  });

  it("falls back to the socket when the last entry is not an IP", () => {
    expect(resolveClientIp(request({ "x-forwarded-for": "203.0.113.5, garbage" }, "10.0.0.2"), true)).toBe("10.0.0.2");
  });

  it("unwraps IPv4-mapped and bracketed addresses", () => {
    expect(resolveClientIp(request({}, "::ffff:192.0.2.9"), false)).toBe("192.0.2.9");
    expect(resolveClientIp(request({ "x-forwarded-for": "[2001:db8::1]" }), true)).toBe("2001:db8::1");
  });

  it("is unknown when nothing is valid", () => {
    expect(resolveClientIp(request({ "x-forwarded-for": "nope" }), true)).toBe("unknown");
  });
});

describe("clientRateLimitKey", () => {
  it("keeps IPv4 as is", () => {
    expect(clientRateLimitKey(request({}, "203.0.113.7"), false)).toBe("203.0.113.7");
  });

  it("collapses an IPv6 address to its /64", () => {
    const a = clientRateLimitKey(request({}, "2001:db8:1:2:aaaa:bbbb:cccc:dddd"), false);
    const b = clientRateLimitKey(request({}, "2001:0db8:0001:0002::1"), false);
    expect(a).toBe("2001:db8:1:2::/64");
    expect(b).toBe(a);
  });

  it("expands :: before cutting", () => {
    expect(clientRateLimitKey(request({}, "2001:db8::1"), false)).toBe("2001:db8:0:0::/64");
  });
});

describe("isHttpsRequest", () => {
  it("is true for a TLS socket", () => {
    expect(isHttpsRequest(request({}, "1.1.1.1", true), false)).toBe(true);
  });

  it("believes X-Forwarded-Proto only behind a trusted proxy", () => {
    const req = request({ "x-forwarded-proto": "https" }, "10.0.0.2");
    expect(isHttpsRequest(req, true)).toBe(true);
    expect(isHttpsRequest(req, false)).toBe(false);
  });
});
