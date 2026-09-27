import { describe, expect, it } from "vitest";
import {
  WEBSPEAK_ERROR_MESSAGES,
  WebSpeakError,
  describeTeamSpeakError,
  normalizeTeamSpeakError,
  normalizeTeamSpeakKickedReason,
  type WebSpeakErrorCode,
} from "./errors.js";

function named(name: string, message = "", extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { name }, extra);
}

describe("normalizeTeamSpeakError: precedence", () => {
  it("returns a WebSpeakError unchanged", () => {
    const original = new WebSpeakError("banned", "custom", false);
    expect(normalizeTeamSpeakError(original)).toBe(original);
  });

  it("lets a server error id outrank every keyword", () => {
    expect(normalizeTeamSpeakError(named("TimeoutError", "flood ban timed out, server is full", { id: "513" })).code).toBe("nickname_in_use");
    expect(normalizeTeamSpeakError(named("Error", "connection refused", { id: 3329 })).code).toBe("banned");
  });

  it("lets a keyword outrank the error class name", () => {
    expect(normalizeTeamSpeakError(named("TimeoutError", "the server is full")).code).toBe("server_full");
  });

  it("lets the error class name outrank transport keywords", () => {
    expect(normalizeTeamSpeakError(named("EaxTagMismatchError", "connection refused")).code).toBe("protocol_negotiation_failed");
  });

  it("checks a server-reported flood before a ban", () => {
    expect(normalizeTeamSpeakError(new Error("flood ban, you are banned")).code).toBe("flooding");
  });

  it("does not steal the classification for bare words such as password, network or denied", () => {
    for (const text of ["network error", "permission denied", "password", "socket closed", "crypto"]) {
      expect(normalizeTeamSpeakError(new Error(text)).code).toBe("unknown");
    }
  });
});

describe("normalizeTeamSpeakError: message heuristics", () => {
  it.each<[string, WebSpeakErrorCode]>([
    ["Nickname length is invalid", "invalid_nickname"],
    ["nickname size out of range", "invalid_nickname"],
    ["invalid parameter size", "invalid_parameter_size"],
    ["parameter is out of range", "invalid_parameter_size"],
    ["This nickname is already in use", "nickname_in_use"],
    ["nickname taken", "nickname_in_use"],
    ["NICKNAME_IN_USE", "nickname_in_use"],
    ["channel requires a password", "channel_password_required"],
    ["wrong password for channel", "channel_password_required"],
    ["i_channel_password too low", "channel_password_required"],
    ["insufficient security level", "identity_security_level_too_low"],
    ["could not validate identity", "identity_security_level_too_low"],
    ["too many clones connected", "identity_limit_reached"],
    ["clone limit reached", "identity_limit_reached"],
    ["client version is outdated", "client_version_outdated"],
    ["outdated client version", "client_version_outdated"],
    ["flood protection", "flooding"],
    ["you are banned", "banned"],
    ["blacklisted", "banned"],
    ["you may retry in 300 seconds", "banned"],
    ["you were kicked", "kicked"],
    ["server is shutting down", "server_shutting_down"],
    ["server_shutdown", "server_shutting_down"],
    ["failed connection initialisation", "connection_initialisation_failed"],
    ["connection initialization failed", "connection_initialisation_failed"],
    ["the server is full", "server_full"],
    ["slot limit reached", "server_full"],
    ["invalid password", "authentication_failed"],
    ["wrong server password", "authentication_failed"],
    ["password required", "authentication_failed"],
    ["authentication failed", "authentication_failed"],
    ["login refused", "authentication_failed"],
  ])("%j is %s", (message, code) => {
    expect(normalizeTeamSpeakError(new Error(message)).code).toBe(code);
  });

  it("does not read 'ban' inside other words", () => {
    expect(normalizeTeamSpeakError(new Error("urban banner")).code).toBe("unknown");
  });
});

describe("normalizeTeamSpeakError: error classes and transport", () => {
  it.each<[string, WebSpeakErrorCode]>([
    ["EaxTagMismatchError", "protocol_negotiation_failed"],
    ["FakeSignatureMismatch", "protocol_negotiation_failed"],
    ["CryptoInitError", "protocol_negotiation_failed"],
    ["InvalidIdentityError", "protocol_negotiation_failed"],
    ["LicenseError", "protocol_negotiation_failed"],
    ["AlreadyConnectedError", "identity_limit_reached"],
    ["TimeoutError", "timeout"],
  ])("error class %s is %s", (name, code) => {
    expect(normalizeTeamSpeakError(named(name, "opaque")).code).toBe(code);
  });

  it.each<[string, WebSpeakErrorCode]>([
    ["getaddrinfo ENOTFOUND ts.example", "host_not_found"],
    ["EAI_AGAIN", "host_not_found"],
    ["name or service not known", "host_not_found"],
    ["connect ECONNREFUSED 127.0.0.1:9987", "connection_refused"],
    ["read ECONNRESET", "connection_reset"],
    ["socket hang up", "connection_reset"],
    ["operation timed out", "timeout"],
    ["ack timeout", "timeout"],
    ["connect ETIMEDOUT", "timeout"],
    ["connect EHOSTUNREACH", "unreachable"],
    ["network is unreachable", "unreachable"],
    ["unexpected EOF", "unreachable"],
    ["handshake failed", "protocol_negotiation_failed"],
    ["init1 reply was invalid", "protocol_negotiation_failed"],
    ["something else entirely", "unknown"],
  ])("%j is %s", (message, code) => {
    expect(normalizeTeamSpeakError(new Error(message)).code).toBe(code);
  });

  it("classifies by Node error code even when the message is empty", () => {
    expect(normalizeTeamSpeakError(named("Error", "", { code: "ECONNREFUSED" })).code).toBe("connection_refused");
  });

  it("names the first matching transport rule when several appear", () => {
    expect(normalizeTeamSpeakError(new Error("ECONNREFUSED after timeout")).code).toBe("connection_refused");
  });
});

describe("normalizeTeamSpeakError: odd inputs and diagnostics", () => {
  it.each([undefined, null, 0, "", {}, []])("does not throw on %j and falls back to unknown", (input) => {
    expect(normalizeTeamSpeakError(input).code).toBe("unknown");
  });

  it("classifies plain strings and plain objects", () => {
    expect(normalizeTeamSpeakError("connection refused").code).toBe("connection_refused");
    expect(normalizeTeamSpeakError({ id: 3329, serverMessage: "spam" }).code).toBe("banned");
  });

  it("collects diagnostics from the error and keeps the original as cause", () => {
    const original = named("TeamSpeakError", "kaboom", { id: 1798, code: "X1", serverMessage: "nope", syscall: "connect", address: "10.0.0.1", port: 9987 });
    const result = normalizeTeamSpeakError(original);
    expect(result.cause).toBe(original);
    expect(result.diagnostics).toEqual({
      name: "TeamSpeakError",
      message: "kaboom",
      id: "1798",
      code: "X1",
      serverMessage: "nope",
      syscall: "connect",
      address: "10.0.0.1",
      port: 9987,
    });
  });

  it("follows the cause chain, keeping the outermost value of each field", () => {
    const inner = named("Error", "inner", { id: "3329" });
    const outer = Object.assign(new Error("outer"), { cause: inner });
    const result = normalizeTeamSpeakError(outer);
    expect(result.code).toBe("banned");
    expect(result.diagnostics).toMatchObject({ name: "Error", message: "outer", id: "3329" });
  });

  it("reads at most four levels of causes", () => {
    let error: Error = named("Error", "deepest", { id: "3329" });
    for (const message of ["level 3", "level 2", "level 1"]) error = Object.assign(new Error(message), { cause: error });
    expect(normalizeTeamSpeakError(error).code).toBe("banned");
    error = Object.assign(new Error("level 0"), { cause: error });
    expect(normalizeTeamSpeakError(error).code).toBe("unknown");
  });

  it("survives a cause cycle", () => {
    const error = new Error("loop") as Error & { cause?: unknown };
    error.cause = error;
    expect(normalizeTeamSpeakError(error).code).toBe("unknown");
    const a = { message: "a", cause: undefined as unknown };
    const b = { message: "b", cause: a };
    a.cause = b;
    expect(normalizeTeamSpeakError(a).code).toBe("unknown");
  });

  it("records a primitive cause as text", () => {
    expect(normalizeTeamSpeakError(new Error("outer", { cause: "raw cause" })).diagnostics.cause).toBe("raw cause");
  });
});

describe("normalizeTeamSpeakKickedReason", () => {
  it("treats reason id 4 as a kick and 5 as a ban", () => {
    const kick = normalizeTeamSpeakKickedReason("Slow down!", 4);
    expect(kick).toMatchObject({ code: "kicked", retryable: false, message: WEBSPEAK_ERROR_MESSAGES.kicked });
    expect(kick.diagnostics).toEqual({ name: "TeamSpeakKick", serverMessage: "Slow down!", id: "4" });
    const ban = normalizeTeamSpeakKickedReason("bye", 5);
    expect(ban).toMatchObject({ code: "banned", retryable: false });
    expect(ban.diagnostics.name).toBe("TeamSpeakBan");
  });

  it("lets the server text decide a ban even when the reason id says kick", () => {
    expect(normalizeTeamSpeakKickedReason("you may retry in 300 seconds", 4).code).toBe("banned");
    expect(normalizeTeamSpeakKickedReason("you are banned", 4).code).toBe("banned");
  });

  it("accepts a numeric string reason id and trims the text", () => {
    const result = normalizeTeamSpeakKickedReason("  hi  ", "5");
    expect(result.code).toBe("banned");
    expect(result.diagnostics).toMatchObject({ serverMessage: "hi", id: "5" });
  });

  it("copes with a missing or non-text reason", () => {
    expect(normalizeTeamSpeakKickedReason(undefined, undefined)).toMatchObject({ code: "kicked", diagnostics: { name: "TeamSpeakKick" } });
    expect(normalizeTeamSpeakKickedReason(42, undefined).diagnostics.serverMessage).toBeUndefined();
  });

  // F7: Number(null) is 0, so a null reason id (the SDK gave none) is logged as id=0.
  it.fails("F7: does not invent reason id 0 when none was given", () => {
    expect(normalizeTeamSpeakKickedReason("x", null).diagnostics.id).toBeUndefined();
  });
});

describe("describeTeamSpeakError", () => {
  it("joins the useful diagnostics in a fixed order", () => {
    const error = normalizeTeamSpeakError(named("TeamSpeakError", "kaboom", { id: 1798, code: "X1", serverMessage: "nope", syscall: "connect", address: "10.0.0.1", port: 9987 }));
    expect(describeTeamSpeakError(error)).toBe("TeamSpeakError; X1; id=1798; nope; connect; address=10.0.0.1; port=9987; kaboom");
  });

  it("prints port 0 and skips empty parts", () => {
    const error = new WebSpeakError("unknown", "x", false, undefined, { name: "N", port: 0 });
    expect(describeTeamSpeakError(error)).toBe("N; port=0");
  });

  it("falls back to the message when there are no diagnostics", () => {
    expect(describeTeamSpeakError(new WebSpeakError("timeout", "TeamSpeak connection timed out", true))).toBe("TeamSpeak connection timed out");
  });
});
