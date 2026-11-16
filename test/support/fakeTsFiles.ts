import { TeamSpeakServerError } from "../../src/lib/teamspeak/index.js";
import type { TSClientAvatar, TSGroup } from "../../src/modules/teamspeak/teamSpeakClient.js";
import type { FakeTSClient } from "./fakeTsClient.js";

/** The avatar the fake server holds for a client, null for an unknown one or one that is not `expectedUid` any more. */
export async function fakeAvatar(client: FakeTSClient, clientId: number, expectedUid: string): Promise<TSClientAvatar | null> {
  client.ready();
  await client.server.step("avatar");
  const member = client.server.members.get(clientId);
  if (!member || (expectedUid && member.uid !== expectedUid)) return null;
  return client.server.avatars.get(member.uid) ?? null;
}

/** The group lists the fake server sends, and the icon files by icon id. */
export class FakeGroups {
  server: TSGroup[] = [];
  channel: TSGroup[] = [];
  readonly icons = new Map<number, Buffer>();
}

const moderationLogs = new WeakMap<FakeTSClient, Record<string, unknown>[]>();

/** What a client asked the server to do to others, in order. */
export const moderationLog = (client: FakeTSClient): Record<string, unknown>[] => {
  if (!moderationLogs.has(client)) moderationLogs.set(client, []);
  return moderationLogs.get(client)!;
};

/**
 * The moderation of a fake client. It needs the rights of moving others, so a guest is refused like on a real server.
 * The fake server has no database: an id is the client id plus 1000, so a mix-up with the client id shows.
 */
export function fakeModeration(client: FakeTSClient) {
  const { server } = client;
  const act = async (entry: Record<string, unknown>) => {
    client.ready();
    await server.step("moderation");
    if (!server.canMove(client.uid)) throw new TeamSpeakServerError({ id: 2568, serverMessage: "insufficient client permissions" });
    moderationLog(client).push(entry);
  };
  return {
    async kick(clientId: number, scope: "channel" | "server", reason = ""): Promise<void> {
      await act({ action: "kick", clientId, scope, reason });
      const target = server.connected.get(clientId);
      if (scope === "server" && target) server.kick(target, reason);
    },
    async ban(uid: string, seconds: number, reason = ""): Promise<void> {
      await act({ action: "ban", uid, seconds, reason });
      const target = [...server.connected.values()].find((connected) => connected.uid === uid);
      if (target) server.kick(target, reason, true);
      else server.bannedUids.add(uid);
    },
    setServerGroup: (groupId: number, databaseId: bigint, assigned: boolean) =>
      act({ action: "serverGroup", groupId, databaseId, assigned }),
    setChannelGroup: (groupId: number, channelId: bigint, databaseId: bigint) =>
      act({ action: "channelGroup", groupId, channelId, databaseId }),
    async databaseId(clientId: number): Promise<bigint | undefined> {
      return server.members.has(clientId) ? BigInt(clientId) + 1000n : undefined;
    },
  };
}

export async function fakeGroupIcon(client: FakeTSClient, iconId: number): Promise<Buffer | null> {
  client.ready();
  await client.server.step("groupIcon");
  return client.server.groups.icons.get(iconId) ?? null;
}
