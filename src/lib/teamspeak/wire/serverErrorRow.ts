import { TeamSpeakServerError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import type { CommandRow } from "./commandRows.js";
import { parseU32 } from "./commandValues.js";

/** The `error id=… msg=…` row that ends every answer. Undefined for `id=0`, a command that worked. */
export function serverErrorFromRow(row: CommandRow): TeamSpeakServerError | undefined {
  const id = parseU32(row.id);
  if (id === undefined) throw new TeamSpeakTransportError("malformedData", "TeamSpeak error row has no valid id");
  if (id === 0) return undefined;
  return new TeamSpeakServerError({
    id,
    serverMessage: row.msg ?? "",
    extraMessage: row.extra_msg || undefined,
    failedPermissionId: parseU32(row.failed_permid),
    returnCode: row.return_code || undefined,
  });
}
