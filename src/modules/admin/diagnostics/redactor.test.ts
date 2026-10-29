import { describe, expect, it } from "vitest";
import { Pseudonyms } from "./pseudonyms.js";
import { redact } from "./redactor.js";

describe("redact", () => {
  it("labels the identifying keys by what they hold", () => {
    const p = new Pseudonyms();
    expect(
      redact(p, {
        ip: "203.0.113.9",
        clientIp: "203.0.113.9",
        address: "10.0.0.4",
        host: "ts.example.org",
        hostname: "ts.example.org",
        targetHost: "ts.example.org",
        target: "ts.example.org:9987",
        relayTarget: "relay.example.org:9987",
        nickname: "Mallory",
        username: "admin-anna",
        name: "Main",
        serverName: "Main",
        relayName: "Edge",
        uid: "AbCd=",
        channel: "Lobby",
        siteName: "Our Site",
      }),
    ).toEqual({
      ip: "ip-1/public",
      clientIp: "ip-1/public",
      address: "ip-2/private",
      host: "host-1.org",
      hostname: "host-1.org",
      targetHost: "host-1.org",
      target: "host-1.org:9987",
      relayTarget: "host-2.org:9987",
      nickname: "guest-1",
      username: "user-1",
      name: "server-1",
      serverName: "server-1",
      relayName: "relay-1",
      uid: "uid-1",
      channel: "channel-1",
      siteName: "[site name]",
    });
  });

  it("keeps an empty channel and removes the text under a secret key", () => {
    const p = new Pseudonyms();
    expect(redact(p, { channel: "", password: "hunter2", sessionToken: "abc", csrf: "x", hasPassword: true })).toEqual({
      channel: "",
      password: "[removed]",
      sessionToken: "[removed]",
      csrf: "[removed]",
      hasPassword: true,
    });
  });

  it("registers the names of an object before it scrubs its free text", () => {
    const p = new Pseudonyms();
    expect(redact(p, { message: "Mallory joined", nickname: "Mallory" })).toEqual({ message: "guest-1 joined", nickname: "guest-1" });
  });

  it("scrubs only addresses in a code, never a known name", () => {
    const p = new Pseudonyms();
    p.nickname("Mallory");
    expect(redact(p, { code: "Mallory from 203.0.113.9", event: "LOGIN" })).toEqual({ code: "Mallory from ip-1/public", event: "LOGIN" });
  });

  it("walks arrays, leaves other values alone and stops at a depth", () => {
    const p = new Pseudonyms();
    expect(redact(p, [{ nickname: "A" }, 3, null, true])).toEqual([{ nickname: "guest-1" }, 3, null, true]);
    let deep: unknown = "leaf";
    for (let level = 0; level < 10; level += 1) deep = { child: deep };
    expect(JSON.stringify(redact(p, deep))).toContain("[too deep]");
  });
});
