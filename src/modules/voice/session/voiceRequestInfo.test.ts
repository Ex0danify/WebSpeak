import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { resolveWebRtcPublicHost } from "./voiceRequestInfo.js";

function request(headers: IncomingMessage["headers"], remoteAddress?: string): IncomingMessage {
  return { headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe("resolveWebRtcPublicHost", () => {
  it.each([
    [
      "origin wins over forwarded host and host",
      { origin: "https://a.example:8443", "x-forwarded-host": "b.example", host: "c.example" },
      "a.example",
    ],
    ["forwarded host wins over host", { "x-forwarded-host": "b.example:3040", host: "c.example" }, "b.example"],
    ["host is the last fallback", { host: "c.example:3040" }, "c.example"],
    ['origin "null" is skipped', { origin: "null", host: "c.example" }, "c.example"],
    ["first entry of a comma list", { "x-forwarded-host": "b.example, proxy.example" }, "b.example"],
    ["unparseable origin falls through", { origin: "http://", host: "c.example" }, "c.example"],
    ["ipv6 literal keeps brackets", { host: "[::1]:3040" }, "[::1]"],
    ["nothing usable", {}, undefined],
  ] as const)("%s", (_name, headers, expected) => {
    expect(resolveWebRtcPublicHost(request({ ...headers }))).toBe(expected);
  });
});
