import type { MessageCode } from "../../../shared/messageCodes.js";
import type { ChannelMember, WebClientEntry } from "../voiceTypes.js";
import type { ClientCommand } from "./voiceProtocol.js";

const MODERATION_TYPES: ReadonlySet<ClientCommand["type"]> = new Set(["kickClient", "banClient", "setServerGroup", "setChannelGroup"]);

export const isModerationCommand = (command: ClientCommand): boolean => MODERATION_TYPES.has(command.type);

type Refuse = (code: MessageCode, message: string) => false;

const NOT_FOUND = ["CLIENT_NOT_FOUND", "Client is offline or not visible"] as const;

/**
 * Runs a kick, ban or group change after checking it against what the gateway itself knows of the room. Whether the
 * administrator may do it is the server's call, its refusal reaches the caller like any other failed command.
 * Returns false when it answered with an error instead of running.
 */
export async function runModeration(
  entry: WebClientEntry,
  command: ClientCommand,
  sendJson: (message: Record<string, unknown>) => void,
): Promise<boolean> {
  const refuse: Refuse = (code, message) => {
    sendJson({ type: "error", requestId: command.requestId, error: { code, message, recoverable: false } });
    return false;
  };
  const clientId = command.payload.clientId as number;
  const member = entry.members.get(clientId);
  if (!member) return refuse(...NOT_FOUND);
  const isSelf = clientId === entry.tsClient.getClientId();
  if (command.type === "kickClient" || command.type === "banClient") {
    return isSelf ? refuse("CANNOT_MODERATE_SELF", "You cannot kick or ban yourself") : punish(entry, command, member, refuse);
  }
  return assignGroup(entry, command, member, isSelf, refuse);
}

async function punish(entry: WebClientEntry, command: ClientCommand, member: ChannelMember, refuse: Refuse): Promise<boolean> {
  const moderation = entry.tsClient.moderation();
  const reason = typeof command.payload.message === "string" ? command.payload.message.trim() : "";
  if (command.type === "kickClient") {
    await moderation.kick(member.id, command.payload.scope as "channel" | "server", reason);
    return true;
  }
  if (!member.uid) return refuse(...NOT_FOUND);
  await moderation.ban(member.uid, command.payload.seconds as number, reason);
  return true;
}

async function assignGroup(
  entry: WebClientEntry,
  command: ClientCommand,
  member: ChannelMember,
  isSelf: boolean,
  refuse: Refuse,
): Promise<boolean> {
  const { tsClient } = entry;
  const moderation = tsClient.moderation();
  const groupId = command.payload.groupId as number;
  const known = command.type === "setServerGroup" ? tsClient.serverGroups() : tsClient.channelGroups();
  if (!known.some((group) => group.id === groupId)) return refuse("GROUP_NOT_FOUND", "Group is unavailable");
  const databaseId = entry.clientDatabaseId?.(member.id) ?? (await moderation.databaseId(member.id));
  if (databaseId === undefined) return refuse(...NOT_FOUND);

  if (command.type === "setServerGroup") {
    await moderation.setServerGroup(groupId, databaseId, command.payload.assigned as boolean);
    return true;
  }
  const channelId = entry.clientChannelId?.(member.id) ?? (isSelf ? tsClient.getChannelId() : undefined);
  if (channelId === undefined) return refuse(...NOT_FOUND);
  await moderation.setChannelGroup(groupId, channelId, databaseId);
  return true;
}
