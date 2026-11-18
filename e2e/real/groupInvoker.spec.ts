import {
  serverGroupAddClient,
  serverGroupDelClient,
  setClientChannelGroup,
  clientInfo,
} from "../../src/lib/teamspeak/command/clientCommands.js";
import type { CommandRequest } from "../../src/lib/teamspeak/command/commandTracker.js";
import { SessionState } from "../../src/lib/teamspeak/session/sessionState.js";
import { buildCommand } from "../../src/lib/teamspeak/wire/commandText.js";
import type { TSClient } from "../../src/modules/teamspeak/teamSpeakClient";
import { poll } from "../helpers/poll";
import { expect, test } from "./fixtures";
import { GUEST_IDENTITY } from "./identities";
import { connectAs } from "./provision";

// Who the server names as the invoker when the groups of a client change. The guest's session is watched for every command
// it receives, to prove which notification carries the invoker for a server group and for a channel group.

const send = (client: TSClient, request: CommandRequest) =>
  client.execCommandWithResponse(buildCommand(request.name, request.params, request));

type Seen = { name: string; rows: Record<string, string>[] };

test("a change of the groups of a client tells the client who made it", async ({ server, query, testChannel }, testInfo) => {
  const room = await testChannel("real-group-invoker");
  const admin = await connectAs(server, 0, "invoker-admin");
  const guest = await connectAs(server, GUEST_IDENTITY, "invoker-guest");
  // Only the clients in a channel hear about its channel groups.
  await guest.switchChannel(BigInt(room.id));
  const seen: Seen[] = [];
  const original = SessionState.prototype.apply;
  SessionState.prototype.apply = function (command) {
    if (/group|clientupdated/i.test(command.name)) seen.push({ name: command.name, rows: command.rows.map((row) => ({ ...row })) });
    return original.call(this, command);
  };
  try {
    const [info] = await send(admin, clientInfo(guest.getClientId()));
    const cldbid = BigInt(info!.client_database_id!);
    const normal = (await query.call("servergrouplist")).find((row) => row.name === "Normal" && row.type === "1")!;
    const [serverInfo] = await query.call("serverinfo");
    const defaultId = serverInfo!.virtualserver_default_channel_group!;
    const channelGroup = (await query.call("channelgrouplist")).find((row) => row.type === "1" && row.cgid !== defaultId)!;

    const step = async (label: string, run: () => Promise<unknown>) => {
      const before = seen.length;
      await run();
      await poll(
        async () => seen.length,
        (count) => count > before,
        { timeoutMs: 5000, message: `a notification after ${label}` },
      ).catch(() => undefined);
      return { label, notifications: seen.slice(before) };
    };
    const log = [
      await step("server group added", () => send(admin, serverGroupAddClient(Number(normal.sgid), cldbid))),
      await step("server group removed", () => send(admin, serverGroupDelClient(Number(normal.sgid), cldbid))),
      await step("channel group set", () => send(admin, setClientChannelGroup(Number(channelGroup.cgid), BigInt(room.id), cldbid))),
      await step("channel group back to default", () => send(admin, setClientChannelGroup(Number(defaultId), BigInt(room.id), cldbid))),
    ];
    await testInfo.attach("group-invoker.json", { body: JSON.stringify(log, null, 2), contentType: "application/json" });
    // Each change names the admin, in the notification the lib reads: a server group by its own one, a channel group in its own.
    const named = (label: string, name: string) =>
      log.find((entry) => entry.label === label)!.notifications.find((notification) => notification.name === name)!.rows[0]!;
    const adminId = String(admin.getClientId());
    for (const [label, name] of [
      ["server group added", "notifyservergroupclientadded"],
      ["server group removed", "notifyservergroupclientdeleted"],
      ["channel group set", "notifyclientchannelgroupchanged"],
      ["channel group back to default", "notifyclientchannelgroupchanged"],
    ] as const) {
      expect(named(label, name), label).toMatchObject({
        invokerid: adminId,
        invokername: "invoker-admin",
        clid: String(guest.getClientId()),
      });
    }
  } finally {
    SessionState.prototype.apply = original;
    await query.call("bandelall").catch(() => undefined);
    await Promise.all([admin, guest].map((client) => client.disconnect().catch(() => undefined)));
  }
});
