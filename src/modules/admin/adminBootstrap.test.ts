import { describe, expect, it } from "vitest";
import { AdminBootstrapError, parseAdminBootstrap, validateAdminUsername } from "./adminBootstrap.js";

describe("parseAdminBootstrap", () => {
  it("has no bootstrap without a password", () => {
    expect(parseAdminBootstrap({ username: "admin" })).toBeUndefined();
  });

  it("takes username and password as given", () => {
    expect(parseAdminBootstrap({ username: "admin", password: "a long enough password" })).toEqual({
      username: "admin",
      password: "a long enough password",
    });
  });

  it("has no default username: an empty one is refused", () => {
    expect(() => parseAdminBootstrap({ username: "", password: "a long enough password" })).toThrow(/^WEBSPEAK_ADMIN_USERNAME: /);
  });

  it("takes the configured username", () => {
    expect(parseAdminBootstrap({ username: "ops.lead@site", password: "a long enough password" })?.username).toBe("ops.lead@site");
  });

  it("names the variable when the password is too short", () => {
    expect(() => parseAdminBootstrap({ username: "admin", password: "short" })).toThrow(AdminBootstrapError);
    expect(() => parseAdminBootstrap({ username: "admin", password: "short" })).toThrow(/^WEBSPEAK_ADMIN_PASSWORD: /);
  });

  it("names the variable when the username is not usable", () => {
    expect(() => parseAdminBootstrap({ username: "has space", password: "a long enough password" })).toThrow(/^WEBSPEAK_ADMIN_USERNAME: /);
  });
});

describe("validateAdminUsername", () => {
  it.each(["admin", "a", "Ops_1", "x".repeat(64)])("accepts %s", (name) => expect(validateAdminUsername(name)).toBeNull());
  it.each(["", "x".repeat(65), "a b", "a/b", "ä", "a:b"])("rejects %j", (name) => expect(validateAdminUsername(name)).not.toBeNull());
});
