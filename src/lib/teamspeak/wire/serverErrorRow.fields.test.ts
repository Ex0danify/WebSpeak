import { describe, expect, it } from "vitest";
import { TeamSpeakServerError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { parseCommand } from "./commandText.js";
import { serverErrorFromRow } from "./serverErrorRow.js";

const row = (text: string) => parseCommand(text).rows[0];

describe("serverErrorFromRow", () => {
  it("returns undefined for id=0", () => {
    expect(serverErrorFromRow(row("error id=0 msg=ok"))).toBeUndefined();
  });

  it("keeps every field of a refusal", () => {
    const error = serverErrorFromRow(
      row("error id=2568 msg=insufficient\\sclient\\spermissions failed_permid=4 extra_msg=x return_code=7"),
    );
    expect(error).toBeInstanceOf(TeamSpeakServerError);
    expect(error).toMatchObject({
      id: 2568,
      serverMessage: "insufficient client permissions",
      extraMessage: "x",
      failedPermissionId: 4,
      returnCode: "7",
    });
  });

  it("leaves empty optional fields undefined", () => {
    expect(serverErrorFromRow(row("error id=1028 msg= extra_msg= return_code="))).toMatchObject({
      serverMessage: "",
      extraMessage: undefined,
      returnCode: undefined,
      failedPermissionId: undefined,
    });
    expect(serverErrorFromRow(row("error id=1028"))).toMatchObject({ serverMessage: "" });
  });

  it("throws on a row without a valid id", () => {
    for (const text of ["error msg=ok", "error id=x"]) {
      expect(() => serverErrorFromRow(row(text))).toThrow(TeamSpeakTransportError);
    }
  });
});
