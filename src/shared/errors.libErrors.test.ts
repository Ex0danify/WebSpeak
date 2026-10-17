import { describe, expect, it } from "vitest";
import {
  CommandTimeoutError,
  HandshakeError,
  TeamSpeakServerError,
  TeamSpeakTransportError,
  type TeamSpeakTransportErrorCode,
} from "../lib/teamspeak/index.js";
import { describeTeamSpeakError, normalizeTeamSpeakError, type WebSpeakErrorCode } from "./errors.js";

describe("normalizeTeamSpeakError with the lib error classes", () => {
  it.each<[number, WebSpeakErrorCode]>([
    [513, "nickname_in_use"],
    [781, "channel_password_required"],
    [1028, "authentication_failed"],
    [1541, "invalid_parameter_size"],
    [3329, "banned"],
  ])("maps server error id %i to %s", (id, code) => {
    expect(normalizeTeamSpeakError(new TeamSpeakServerError({ id, serverMessage: "x" })).code).toBe(code);
  });

  it("keeps id and server message in the diagnostics", () => {
    const error = normalizeTeamSpeakError(
      new TeamSpeakServerError({
        id: 3329,
        serverMessage: "connection failed, you are banned",
        extraMessage: "you may retry in 540 seconds",
      }),
    );
    expect(error.diagnostics).toMatchObject({
      name: "TeamSpeakServerError",
      id: "3329",
      serverMessage: "connection failed, you are banned",
    });
    expect(describeTeamSpeakError(error)).toContain("id=3329");
  });

  it("falls back to unknown for an unnamed server id", () => {
    expect(normalizeTeamSpeakError(new TeamSpeakServerError({ id: 2568, serverMessage: "insufficient client permissions" })).code).toBe(
      "unknown",
    );
  });

  it.each<[TeamSpeakTransportErrorCode, WebSpeakErrorCode]>([
    ["timeout", "timeout"],
    ["ackTimeout", "timeout"],
    ["handshakeFailed", "protocol_negotiation_failed"],
    ["cryptoInit", "protocol_negotiation_failed"],
    ["malformedData", "protocol_negotiation_failed"],
    ["closedByServer", "connection_reset"],
  ])("maps transport code %s to %s", (transportCode, code) => {
    expect(normalizeTeamSpeakError(new TeamSpeakTransportError(transportCode, "x")).code).toBe(code);
  });

  it("classifies a socket error by its cause", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9987"), { code: "ECONNREFUSED" });
    expect(normalizeTeamSpeakError(new TeamSpeakTransportError("socketError", "send failed", { cause })).code).toBe("connection_refused");
  });

  it("maps a command timeout to timeout", () => {
    expect(normalizeTeamSpeakError(new CommandTimeoutError("clientmove", 5000)).code).toBe("timeout");
  });

  it("uses the server id behind a handshake error, and protocol negotiation without one", () => {
    const refused = new HandshakeError("clientinit", "server refused", {
      cause: new TeamSpeakServerError({ id: 1027, serverMessage: "max clients reached" }),
    });
    expect(normalizeTeamSpeakError(refused).code).toBe("server_full");
    expect(normalizeTeamSpeakError(new HandshakeError("initivexpand2", "server proof invalid")).code).toBe("protocol_negotiation_failed");
  });
});
