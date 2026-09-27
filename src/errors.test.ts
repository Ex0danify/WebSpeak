import { describe, expect, it } from "vitest";
import {
  TEAMSPEAK_SERVER_ERROR_IDS,
  WEBSPEAK_ERROR_MESSAGES,
  WebSpeakError,
  clientConnectionFailureCode,
  normalizeTeamSpeakError,
  teamSpeakServerErrorCode,
  type ClientConnectionFailureCode,
  type WebSpeakErrorCode,
} from "./errors.js";

const ALL_CODES = Object.keys(WEBSPEAK_ERROR_MESSAGES) as WebSpeakErrorCode[];

/** Every server error id the gateway names. A new id in the source table fails the coverage test below until it is listed here. */
const EXPECTED_SERVER_IDS: Record<string, WebSpeakErrorCode> = {
  "513": "nickname_in_use",
  "515": "server_full",
  "519": "identity_security_level_too_low",
  "520": "authentication_failed",
  "521": "identity_limit_reached",
  "522": "client_version_outdated",
  "524": "flooding",
  "781": "channel_password_required",
  "1026": "server_shutting_down",
  "1027": "server_full",
  "1028": "authentication_failed",
  "1536": "invalid_parameter_size",
  "1537": "invalid_parameter_size",
  "1538": "invalid_parameter_size",
  "1539": "invalid_parameter_size",
  "1540": "invalid_parameter_size",
  "1541": "invalid_parameter_size",
  "1542": "invalid_parameter_size",
  "1543": "protocol_negotiation_failed",
  "1797": "connection_initialisation_failed",
  "1798": "host_not_found",
  "1805": "protocol_negotiation_failed",
  "1806": "protocol_negotiation_failed",
  "2816": "server_full",
  "2817": "server_full",
  "3329": "banned",
  "3330": "banned",
  "3331": "flooding",
};

/** Message strings are translated by the browser, so they are pinned. */
const EXPECTED_MESSAGES: Record<WebSpeakErrorCode, string> = {
  invalid_target: "The TeamSpeak server address is invalid",
  invalid_nickname: "TeamSpeak refused the nickname: it must be 3-30 characters long",
  nickname_in_use: "This nickname is already used by another user on the TeamSpeak server",
  host_not_found: "TeamSpeak server hostname could not be resolved",
  unreachable: "TeamSpeak server is unreachable",
  connection_refused: "TeamSpeak server refused the connection",
  connection_reset: "TeamSpeak connection was reset",
  timeout: "TeamSpeak connection timed out",
  authentication_failed: "TeamSpeak authentication failed",
  channel_password_required: "The TeamSpeak channel requires a password",
  identity_security_level_too_low: "This TeamSpeak identity's security level is below the server requirement",
  identity_limit_reached: "This TeamSpeak identity already holds the maximum number of connections",
  client_version_outdated: "The TeamSpeak server requires a newer client version",
  flooding: "The TeamSpeak server's flood protection refused the connection",
  banned: "You are banned from this TeamSpeak server",
  kicked: "You were kicked from the TeamSpeak server",
  server_shutting_down: "The TeamSpeak server is shutting down",
  connection_initialisation_failed: "The TeamSpeak server refused the connection during initialisation",
  server_full: "The TeamSpeak server is full",
  invalid_parameter_size: "TeamSpeak refused a parameter because its length or value is out of range",
  protocol_negotiation_failed: "TeamSpeak protocol negotiation failed",
  unknown: "TeamSpeak connection failed",
};

/** Codes for which an unchanged reconnect cannot succeed. */
const NON_RETRYABLE: ReadonlySet<WebSpeakErrorCode> = new Set([
  "invalid_target",
  "invalid_nickname",
  "nickname_in_use",
  "authentication_failed",
  "channel_password_required",
  "identity_security_level_too_low",
  "identity_limit_reached",
  "client_version_outdated",
  "banned",
  "kicked",
  "invalid_parameter_size",
  "connection_initialisation_failed",
  "unknown",
]);

/** The code the browser receives for each normalized code (authentication_failed is covered separately, it depends on the password). */
const EXPECTED_CLIENT_CODES: Record<WebSpeakErrorCode, ClientConnectionFailureCode> = {
  invalid_target: "INVALID_TARGET",
  invalid_nickname: "INVALID_NICKNAME",
  nickname_in_use: "NICKNAME_IN_USE",
  host_not_found: "HOST_NOT_FOUND",
  unreachable: "UNREACHABLE",
  connection_refused: "CONNECTION_REFUSED",
  connection_reset: "CONNECTION_RESET",
  timeout: "TIMEOUT",
  authentication_failed: "SERVER_PASSWORD_REQUIRED",
  channel_password_required: "CHANNEL_PASSWORD_REQUIRED",
  identity_security_level_too_low: "IDENTITY_SECURITY_LEVEL_TOO_LOW",
  identity_limit_reached: "IDENTITY_LIMIT_REACHED",
  client_version_outdated: "CLIENT_VERSION_OUTDATED",
  flooding: "FLOOD_PROTECTION",
  banned: "BANNED",
  kicked: "KICKED",
  server_shutting_down: "SERVER_SHUTTING_DOWN",
  connection_initialisation_failed: "CONNECTION_INITIALISATION_FAILED",
  server_full: "SERVER_FULL",
  invalid_parameter_size: "INVALID_NICKNAME",
  protocol_negotiation_failed: "PROTOCOL_NEGOTIATION_FAILED",
  unknown: "CONNECTION_FAILED",
};

/** One raw error per code that normalizeTeamSpeakError can produce. */
const SAMPLE_INPUT: Record<string, unknown> = {
  invalid_nickname: new Error("nickname length is invalid"),
  nickname_in_use: { id: 513 },
  host_not_found: new Error("getaddrinfo ENOTFOUND ts.example"),
  unreachable: new Error("connect EHOSTUNREACH"),
  connection_refused: new Error("connect ECONNREFUSED"),
  connection_reset: new Error("read ECONNRESET"),
  timeout: new Error("operation timed out"),
  authentication_failed: { id: 520 },
  channel_password_required: { id: 781 },
  identity_security_level_too_low: { id: 519 },
  identity_limit_reached: { id: 521 },
  client_version_outdated: { id: 522 },
  flooding: { id: 524 },
  banned: { id: 3329 },
  kicked: new Error("you were kicked"),
  server_shutting_down: { id: 1026 },
  connection_initialisation_failed: { id: 1797 },
  server_full: { id: 515 },
  invalid_parameter_size: { id: 1541 },
  protocol_negotiation_failed: { id: 1543 },
  unknown: new Error("???"),
};

function named(name: string, message = "", extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { name }, extra);
}

describe("server error id table", () => {
  it("lists exactly the ids that are tested here (a new id fails until it gets a row)", () => {
    expect(Object.keys(TEAMSPEAK_SERVER_ERROR_IDS).sort()).toEqual(Object.keys(EXPECTED_SERVER_IDS).sort());
  });

  it("only maps to codes that have a message", () => {
    for (const code of Object.values(TEAMSPEAK_SERVER_ERROR_IDS)) expect(ALL_CODES).toContain(code);
  });

  it.each(Object.entries(EXPECTED_SERVER_IDS))("id %s is %s, as a bare id and inside an error", (id, code) => {
    expect(teamSpeakServerErrorCode(id)).toBe(code);
    expect(normalizeTeamSpeakError(named("Error", "connect failed", { id })).code).toBe(code);
  });

  it("also names the id when it arrives as the error's code, or as text in the message", () => {
    expect(normalizeTeamSpeakError(named("Error", "x", { code: "3329" })).code).toBe("banned");
    expect(normalizeTeamSpeakError(new Error("server refused: id=515 msg=server is unavailable")).code).toBe("server_full");
    expect(normalizeTeamSpeakError(new Error("error id 1028")).code).toBe("authentication_failed");
    expect(normalizeTeamSpeakError(new Error("error id: 781")).code).toBe("channel_password_required");
  });
});

describe("teamSpeakServerErrorCode", () => {
  it.each([
    ["decimal", 515],
    ["decimal text", "515"],
    ["padded decimal", "0515"],
    ["whitespace", "  515  "],
    ["0x hex", "0x0203"],
    ["upper case hex", "0X0D01"],
    ["hex without prefix", "0d01"],
  ])("accepts %s", (_name, id) => {
    expect(teamSpeakServerErrorCode(id)).not.toBeNull();
  });

  it("reads hex and decimal forms of the same id alike", () => {
    expect(teamSpeakServerErrorCode("0x0203")).toBe(teamSpeakServerErrorCode("515"));
    expect(teamSpeakServerErrorCode("0x0d01")).toBe("banned");
  });

  it("treats an all-digit string without 0x as decimal (so bare '0203' is id 203, not 0x0203)", () => {
    expect(teamSpeakServerErrorCode("0203")).toBeNull();
  });

  it.each([undefined, null, "", "  ", "abc", "12345678", "0x", "0xzzzz", "515a", "-515", "5.15", 999, {}, []])("returns null for %j", (id) => {
    expect(teamSpeakServerErrorCode(id)).toBeNull();
  });

  it("returns null for well-formed ids that are deliberately not mapped", () => {
    for (const id of ["512", "516", "1029", "1799", "3328", "0x0200"]) expect(teamSpeakServerErrorCode(id)).toBeNull();
  });
});

describe("messages and retry rules", () => {
  it("has a message for every code, and the message text is pinned", () => {
    expect(Object.keys(EXPECTED_MESSAGES).sort()).toEqual([...ALL_CODES].sort());
    expect(WEBSPEAK_ERROR_MESSAGES).toEqual(EXPECTED_MESSAGES);
  });

  it("never embeds a raw server id in a message (the raw detail travels in diagnostics)", () => {
    for (const message of Object.values(WEBSPEAK_ERROR_MESSAGES)) expect(message).not.toMatch(/\bid\b|\d{3,}/i);
  });

  it("has a sample input for every code (a new code fails until it gets one); invalid_target is raised by the caller, not by normalizing", () => {
    expect(Object.keys(SAMPLE_INPUT).sort()).toEqual(ALL_CODES.filter((code) => code !== "invalid_target").sort());
  });

  it.each(Object.entries(SAMPLE_INPUT))("%s carries its message and the documented retry rule", (code, input) => {
    const error = normalizeTeamSpeakError(input);
    expect(error.code).toBe(code);
    expect(error.message).toBe(EXPECTED_MESSAGES[code as WebSpeakErrorCode]);
    expect(error.retryable).toBe(!NON_RETRYABLE.has(code as WebSpeakErrorCode));
  });

  it("never lets an unmapped refusal turn into a reconnect loop", () => {
    expect(normalizeTeamSpeakError(new Error("???")).retryable).toBe(false);
  });
});

describe("clientConnectionFailureCode", () => {
  it.each(ALL_CODES.filter((code) => code !== "authentication_failed"))("maps %s", (code) => {
    expect(clientConnectionFailureCode(new WebSpeakError(code, "x", false))).toBe(EXPECTED_CLIENT_CODES[code]);
  });

  it("covers every code (a new code fails until it gets a row)", () => {
    expect(Object.keys(EXPECTED_CLIENT_CODES).sort()).toEqual([...ALL_CODES].sort());
  });

  it("splits authentication_failed on whether the user sent a server password", () => {
    const error = new WebSpeakError("authentication_failed", "x", false);
    expect(clientConnectionFailureCode(error)).toBe("SERVER_PASSWORD_REQUIRED");
    expect(clientConnectionFailureCode(error, "")).toBe("SERVER_PASSWORD_REQUIRED");
    expect(clientConnectionFailureCode(error, "   ")).toBe("SERVER_PASSWORD_REQUIRED");
    expect(clientConnectionFailureCode(error, "secret")).toBe("INVALID_SERVER_PASSWORD");
  });

  it("keeps the identity, ban and flood families distinct", () => {
    const family = ["identity_security_level_too_low", "identity_limit_reached", "banned", "kicked", "flooding"] as const;
    const codes = family.map((code) => clientConnectionFailureCode(new WebSpeakError(code, "x", false)));
    expect(new Set(codes).size).toBe(family.length);
    expect(codes).toEqual(["IDENTITY_SECURITY_LEVEL_TOO_LOW", "IDENTITY_LIMIT_REACHED", "BANNED", "KICKED", "FLOOD_PROTECTION"]);
  });

  it("is the only many-to-one mapping: invalid_parameter_size shows as INVALID_NICKNAME during connect", () => {
    const codes = ALL_CODES.filter((code) => code !== "authentication_failed").map((code) => EXPECTED_CLIENT_CODES[code]);
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
    expect(duplicates).toEqual(["INVALID_NICKNAME"]);
  });
});
