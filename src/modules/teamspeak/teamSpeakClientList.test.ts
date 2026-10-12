import { describe, expect, it } from "vitest";
import { listClientsWithStatus } from "./teamSpeakClientList.js";

describe("listClientsWithStatus", () => {
  it("keeps the away, mute and commander flags", async () => {
    const commands: string[] = [];
    const source = {
      execCommandWithResponse: async (command: string) => {
        commands.push(command);
        return [
          {
            clid: "3",
            cid: "7",
            client_nickname: "Ann",
            client_unique_identifier: "uid3",
            client_type: "0",
            client_servergroups: "6,9",
            client_away: "1",
            client_away_message: "brb",
            client_input_muted: "1",
            client_output_muted: "0",
            client_is_channel_commander: "1",
          },
        ];
      },
    };
    expect(await listClientsWithStatus(source)).toEqual([
      {
        id: 3,
        nickname: "Ann",
        uid: "uid3",
        channelID: 7n,
        type: 0,
        serverGroups: ["6", "9"],
        away: true,
        awayMessage: "brb",
        inputMuted: true,
        outputMuted: false,
        channelCommander: true,
      },
    ]);
    expect(commands).toEqual(["clientlist -uid -away -voice -groups"]);
  });

  it("reads a row without flags as present and unmuted", async () => {
    const source = { execCommandWithResponse: async () => [{ clid: "4", cid: "1", client_nickname: "Bob" }] };
    const [entry] = await listClientsWithStatus(source);
    expect(entry).toMatchObject({ id: 4, serverGroups: [], away: false, inputMuted: false, outputMuted: false });
  });
});
