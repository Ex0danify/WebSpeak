import { TeamSpeakServerError } from "../../src/lib/teamspeak/index.js";
import type { TSChatMessage, TSChatScope, TSDirectoryClient as DirectoryClientInfo } from "../../src/modules/teamspeak/teamSpeakClient.js";
import type { FakeTeamSpeakServer } from "./fakeTsClient.js";

/** Routes a text message of the fake server: channel to the sender's channel, private to one client, server to everyone. */
export function deliverChat(
  server: FakeTeamSpeakServer,
  from: DirectoryClientInfo,
  scope: TSChatScope,
  message: string,
  targetId: bigint,
): void {
  const targetMode = scope === "private" ? 1 : scope === "server" ? 3 : 2;
  if (scope === "private" && !server.members.has(Number(targetId)))
    throw new TeamSpeakServerError({ id: 512, serverMessage: "invalid clientID" });
  // Channel notifications carry no target; the SDK reports it as 0.
  const payload: TSChatMessage = {
    invokerName: from.nickname,
    invokerId: from.id,
    invokerUid: from.uid,
    message,
    targetMode,
    targetId: scope === "channel" ? 0n : targetId,
  };
  for (const [id, client] of server.connected) {
    if (id === from.id) continue;
    const member = server.members.get(id)!;
    if (scope === "channel" && member.channelID !== from.channelID) continue;
    if (scope === "private" && id !== Number(targetId)) continue;
    client.emit("textMessage", payload);
  }
}
