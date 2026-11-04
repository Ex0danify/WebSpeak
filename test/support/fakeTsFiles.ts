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

export async function fakeGroupIcon(client: FakeTSClient, iconId: number): Promise<Buffer | null> {
  client.ready();
  await client.server.step("groupIcon");
  return client.server.groups.icons.get(iconId) ?? null;
}
