import { describe, expect, it } from "vitest";
import { Pseudonyms } from "./pseudonyms.js";
import { redact } from "./redactor.js";

describe("Pseudonyms", () => {
  it("gives the same address the same label and keeps its class", () => {
    const p = new Pseudonyms();
    expect(p.ip("203.0.113.9")).toBe("ip-1/public");
    expect(p.ip("192.168.1.20")).toBe("ip-2/private");
    expect(p.ip("127.0.0.1")).toBe("ip-3/loopback");
    expect(p.ip("203.0.113.9")).toBe("ip-1/public");
  });

  it("treats a mapped IPv4 address like the plain one and classes IPv6", () => {
    const p = new Pseudonyms();
    const plain = p.ip("10.1.2.3");
    expect(p.ip("::ffff:10.1.2.3")).toBe(plain);
    expect(p.ip("::1")).toMatch(/loopback$/);
    expect(p.ip("fd00::5")).toMatch(/private$/);
    expect(p.ip("2001:db8::1")).toMatch(/public$/);
  });

  it("leaves a wildcard bind address alone", () => {
    expect(new Pseudonyms().ip("0.0.0.0")).toBe("0.0.0.0");
  });

  it("keeps the port of a target and the last label of a domain", () => {
    const p = new Pseudonyms();
    expect(p.target("ts.example.org:9987")).toBe("host-1.org:9987");
    expect(p.target("[2001:db8::1]:9987")).toBe("ip-1/public:9987");
    expect(p.target("ts.example.org:10011")).toBe("host-1.org:10011");
    expect(p.host("localhost")).toBe("localhost");
  });

  it("scrubs addresses, e-mail addresses, home folders and known names out of free text", () => {
    const p = new Pseudonyms();
    p.nickname("Alexandra");
    p.host("voice.example.org");
    const text = p.scrub(
      "Alexandra failed to reach voice.example.org (198.51.100.7, 2001:db8::7) mail a.b@example.com at /home/lucas/app at 12:30:45",
    );
    expect(text).toBe("guest-1 failed to reach host-1.org (ip-1/public, ip-2/public) mail email-1 at /home/<user>/app at 12:30:45");
  });

  it("only replaces a name that stands alone, so words and codes that contain it stay readable", () => {
    const p = new Pseudonyms();
    p.user("admin");
    expect(p.scrub("admin failed, ADMIN_LOGIN_FAILED, Administrator login failed, admin-api, user admin.")).toBe(
      "user-1 failed, ADMIN_LOGIN_FAILED, Administrator login failed, admin-api, user user-1.",
    );
  });

  it("labels a short IPv4 form like the address it is and does not let it eat other addresses", () => {
    const p = new Pseudonyms();
    expect(p.target("127.1:9987")).toBe("ip-1/loopback:9987");
    expect(p.host("2130706433")).toBe("ip-1/loopback");
    expect(p.host("999.1.1.1")).toMatch(/^host-1\.1$/);
    expect(p.scrub("address already in use 127.0.0.1:3040")).toBe("address already in use ip-1/loopback:3040");
  });

  it("labels a client uid", () => {
    const p = new Pseudonyms();
    expect(p.uid("jX0QoY1RidT6vLYtnIhakPwUo6BDRjR+XdxtOXNbMNU=")).toBe("uid-1");
    expect(p.scrub("client jX0QoY1RidT6vLYtnIhakPwUo6BDRjR+XdxtOXNbMNU= left")).toBe("client uid-1 left");
  });

  it("does not turn a version or a timestamp into an address", () => {
    expect(new Pseudonyms().scrub("node 22.5.0 at 10:11:12, build 1.2.3.4.5")).toContain("22.5.0 at 10:11:12");
  });
});

describe("redact", () => {
  it("uses the key first and the content second", () => {
    const p = new Pseudonyms();
    const result = redact(p, {
      clientIp: "203.0.113.9",
      nickname: "Mallory",
      target: "ts.example.org:9987",
      username: "root",
      name: "Clan server",
      message: "Mallory came from 203.0.113.9",
      nested: [{ ip: "203.0.113.9" }],
      count: 3,
      hasPassword: true,
    });
    expect(result).toEqual({
      clientIp: "ip-1/public",
      nickname: "guest-1",
      target: "host-1.org:9987",
      username: "user-1",
      name: "server-1",
      message: "guest-1 came from ip-1/public",
      nested: [{ ip: "ip-1/public" }],
      count: 3,
      hasPassword: true,
    });
  });

  it("registers the names of a line before it scrubs the message in front of them", () => {
    const p = new Pseudonyms();
    expect(redact(p, { msg: "Mallory left", nickname: "Mallory" })).toEqual({ msg: "guest-1 left", nickname: "guest-1" });
  });

  it("keeps codes intact even when a guest picked a nickname that matches one", () => {
    const p = new Pseudonyms();
    expect(redact(p, { nickname: "web", component: "web", event: "web_started", msg: "web joined from 203.0.113.9", reason: "from 203.0.113.9" })).toEqual({
      nickname: "guest-1",
      component: "web",
      event: "web_started",
      msg: "guest-1 joined from ip-1/public",
      reason: "from ip-1/public",
    });
  });

  it("labels the uid of a client", () => {
    expect(redact(new Pseudonyms(), { uid: "abc+def=", clientId: 4 })).toEqual({ uid: "uid-1", clientId: 4 });
  });

  it("drops a text under a secret key and keeps a flag", () => {
    const p = new Pseudonyms();
    expect(redact(p, { serverPassword: "x", tokenHash: "y", csrfToken: "z", hasToken: true, cookie: "c" })).toEqual({
      serverPassword: "[removed]",
      tokenHash: "[removed]",
      csrfToken: "[removed]",
      hasToken: true,
      cookie: "[removed]",
    });
  });

  it("stops at a cycle deep enough to be a mistake", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 20; index += 1) cursor = cursor.next = {};
    expect(JSON.stringify(redact(new Pseudonyms(), deep))).toContain("[too deep]");
  });
});
