import { describe, expect, it } from "vitest";
import { TeamSpeakErrorId, teamSpeakErrorIdName } from "./errorIds.js";
import { CommandTimeoutError, HandshakeError, TeamSpeakError, TeamSpeakServerError, TeamSpeakTransportError } from "./teamSpeakErrors.js";

describe("TeamSpeakServerError", () => {
  it("keeps every field of the error answer", () => {
    const error = new TeamSpeakServerError({
      id: 2568,
      serverMessage: "insufficient client permissions",
      extraMessage: "x",
      failedPermissionId: 42,
      returnCode: "r1",
    });
    expect(error).toBeInstanceOf(TeamSpeakError);
    expect(error).toMatchObject({ name: "TeamSpeakServerError", id: 2568, extraMessage: "x", failedPermissionId: 42, returnCode: "r1" });
    expect(error.message).toBe("TeamSpeak server error: insufficient client permissions, x (id=2568)");
    expect(error.idName).toBe("permissionsClientInsufficient");
  });

  it("leaves optional fields undefined and unknown ids unnamed", () => {
    const error = new TeamSpeakServerError({ id: 1, serverMessage: "undefined" });
    expect(error.message).toBe("TeamSpeak server error: undefined (id=1)");
    expect(error.extraMessage).toBeUndefined();
    expect(error.failedPermissionId).toBeUndefined();
    expect(error.returnCode).toBeUndefined();
    expect(error.idName).toBeUndefined();
  });
});

describe("other error classes", () => {
  it("carry their code, command and step", () => {
    const cause = new Error("EHOSTUNREACH");
    const transport = new TeamSpeakTransportError("socketError", "send failed", { cause });
    expect(transport).toMatchObject({ name: "TeamSpeakTransportError", code: "socketError", message: "send failed", cause });

    const timeout = new CommandTimeoutError("clientmove", 5000);
    expect(timeout).toMatchObject({ name: "CommandTimeoutError", command: "clientmove", timeoutMs: 5000 });
    expect(timeout.message).toContain("5000 ms");

    const handshake = new HandshakeError("initivexpand2", "server proof invalid");
    expect(handshake).toMatchObject({ name: "HandshakeError", step: "initivexpand2" });
    expect(handshake.message).toBe("TeamSpeak handshake failed at initivexpand2: server proof invalid");
    expect(new TeamSpeakError("plain").name).toBe("TeamSpeakError");
  });
});

describe("TeamSpeakErrorId", () => {
  it("matches the decimal ids the gateway maps", () => {
    expect(TeamSpeakErrorId.clientNicknameInUse).toBe(513);
    expect(TeamSpeakErrorId.channelInvalidPassword).toBe(781);
    expect(TeamSpeakErrorId.serverMaxClientsReached).toBe(1027);
    expect(TeamSpeakErrorId.serverInvalidPassword).toBe(1028);
    expect(TeamSpeakErrorId.parameterInvalidSize).toBe(1541);
    expect(TeamSpeakErrorId.handshakeFailed).toBe(1806);
    expect(TeamSpeakErrorId.accountingSlotLimitReached).toBe(2817);
    expect(TeamSpeakErrorId.connectFailedBanned).toBe(3329);
    expect(TeamSpeakErrorId.banFlooding).toBe(3331);
  });

  it("has unique ids and names them back", () => {
    const ids = Object.values(TeamSpeakErrorId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(teamSpeakErrorIdName(0x0201)).toBe("clientNicknameInUse");
    expect(teamSpeakErrorIdName(0x0410)).toBeUndefined();
  });
});
