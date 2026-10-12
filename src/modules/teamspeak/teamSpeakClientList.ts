import type { Client, DirectoryClientInfo } from "@echosixhiya/teamspeak-client";

type ClientListSource = Pick<Client, "execCommandWithResponse">;

/**
 * Runs `clientlist` and keeps the away, mute and commander flags. The SDK's listClients asks for them but
 * drops them, so everyone would start without a status until a live update arrived.
 */
export async function listClientsWithStatus(client: ClientListSource): Promise<DirectoryClientInfo[]> {
  const rows = await client.execCommandWithResponse("clientlist -uid -away -voice -groups", 5000);
  return rows.map((row) => {
    const groups = row.client_servergroups ?? "";
    return {
      id: parseInt(row.clid ?? "0", 10),
      nickname: row.client_nickname ?? "",
      uid: row.client_unique_identifier ?? "",
      channelID: BigInt(row.cid ?? "0"),
      type: parseInt(row.client_type ?? "0", 10),
      serverGroups: groups ? groups.split(",") : [],
      away: row.client_away === "1",
      awayMessage: row.client_away_message ?? "",
      inputMuted: row.client_input_muted === "1",
      outputMuted: row.client_output_muted === "1",
      channelCommander: row.client_is_channel_commander === "1",
    };
  });
}
