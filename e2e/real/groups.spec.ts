import { poll } from "../helpers/poll";
import { expect, test } from "./fixtures";
import { GUEST_IDENTITY } from "./identities";
import { connectAs, databaseIdOf } from "./provision";

// Server and channel groups as the real server hands them out: which group it names as the default, and what a person is
// told when a group is given or taken. The default group is whatever the server says, so the tests read it from there.

test("the gateway marks exactly the groups the server names as its defaults", async ({ server, query }) => {
  const [info] = await query.call("serverinfo");
  const serverRows = await query.call("servergrouplist");
  const channelRows = await query.call("channelgrouplist");
  const client = await connectAs(server, GUEST_IDENTITY, "real-groups-defaults");
  try {
    const serverGroups = await poll(
      async () => client.serverGroups(),
      (groups) => groups.length > 0,
      { message: "the server group list" },
    );
    const channelGroups = await poll(
      async () => client.channelGroups(),
      (groups) => groups.length > 0,
      { message: "the channel group list" },
    );

    const nameOf = (rows: Record<string, string>[], key: string, id: string) => rows.find((row) => row[key] === id)?.name;
    const defaultServer = serverGroups.filter((group) => group.isDefault);
    const defaultChannel = channelGroups.filter((group) => group.isDefault);
    expect(defaultServer.map((group) => group.id)).toEqual([Number(info.virtualserver_default_server_group)]);
    expect(defaultChannel.map((group) => group.id)).toEqual([Number(info.virtualserver_default_channel_group)]);
    expect(defaultServer[0]!.name).toBe(nameOf(serverRows, "sgid", info.virtualserver_default_server_group));
    expect(defaultChannel[0]!.name).toBe(nameOf(channelRows, "cgid", info.virtualserver_default_channel_group));
  } finally {
    await client.disconnect();
  }
});

test("you are told about a server group given and taken, and not about the default group coming back", async ({
  person,
  query,
  testChannel,
}) => {
  const [info] = await query.call("serverinfo");
  const defaultName = (await query.call("servergrouplist")).find((row) => row.sgid === info.virtualserver_default_server_group)!.name;
  const room = await testChannel("real-groups-server");
  const me = await person(GUEST_IDENTITY, "groups-server");
  await me.join(room.name);
  const cldbid = await databaseIdOf(query, me.identity.uid);
  // The default regular groups are all there is to give: Guest is the default, Normal is the one to be given and taken.
  const normal = (await query.call("servergrouplist")).find((row) => row.name === "Normal" && row.type === "1")!;
  try {
    await query.call("servergroupaddclient", { sgid: normal.sgid, cldbid });
    await expect(me.page.getByText("Server group assigned: Normal")).toBeVisible();

    await query.call("servergroupdelclient", { sgid: normal.sgid, cldbid });
    await expect(me.page.getByText("Server group revoked: Normal")).toBeVisible();
    await expect(me.page.getByText(new RegExp(`Server group (assigned|revoked): ${defaultName}$`))).toHaveCount(0);
  } finally {
    await query.call("servergroupdelclient", { sgid: normal.sgid, cldbid }).catch(() => undefined);
  }
});

test("you are told about a channel group given, and falling back to the default is a revoke", async ({ person, query, testChannel }) => {
  const [info] = await query.call("serverinfo");
  const defaultId = info.virtualserver_default_channel_group;
  const regular = (await query.call("channelgrouplist")).find((row) => row.type === "1" && row.cgid !== defaultId);
  if (!regular) throw new Error("The test server has no channel group besides its default");
  const room = await testChannel("real-groups-channel");
  const me = await person(GUEST_IDENTITY, "groups-channel");
  await me.join(room.name);
  const cldbid = await databaseIdOf(query, me.identity.uid);

  await query.call("setclientchannelgroup", { cgid: regular.cgid, cid: room.id, cldbid });
  await expect(me.page.getByText(`Channel group assigned: ${regular.name}`)).toBeVisible();

  await query.call("setclientchannelgroup", { cgid: defaultId, cid: room.id, cldbid });
  await expect(me.page.getByText(`Channel group revoked: ${regular.name}`)).toBeVisible();
});
