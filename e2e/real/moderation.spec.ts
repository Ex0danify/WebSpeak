import {
  banUid,
  clientInfo,
  clientKick,
  serverGroupAddClient,
  serverGroupDelClient,
  setClientChannelGroup,
} from "../../src/lib/teamspeak/command/clientCommands.js";
import type { CommandRequest } from "../../src/lib/teamspeak/command/commandTracker.js";
import { buildCommand } from "../../src/lib/teamspeak/wire/commandText.js";
import type { TSClient } from "../../src/modules/teamspeak/teamSpeakClient";
import { MAX_MODERATION_REASON_LENGTH } from "../../src/modules/voice/messages/voiceProtocol";
import { normalizeTeamSpeakError } from "../../src/shared/errors";
import { poll } from "../helpers/poll";
import { expect, test } from "./fixtures";
import { GUEST_IDENTITY, identities } from "./identities";
import { connectAs, databaseIdOf } from "./provision";
import type { WebQuery } from "./server";

// The moderation commands of the lib against the real server, as an administrator (identity 0) sends them to a guest. They
// settle what the unit tests can only assume: the parameters the server accepts, the reason ids a victim is told, and what
// the server reports back about a client's database id and groups.

const send = (client: TSClient, request: CommandRequest) =>
  client.execCommandWithResponse(buildCommand(request.name, request.params, request));

/** The first thing a victim is told about its leave, as the lib names the error. */
function leaveCodes(client: TSClient): string[] {
  const codes: string[] = [];
  client.on("kicked", (error: { code: string }) => codes.push(error.code));
  return codes;
}

let open: TSClient[] = [];

test.afterEach(async ({ query }) => {
  // A ban that outlives its test would keep its identity out of every later one.
  await query.call("bandelall").catch(() => undefined);
  await Promise.all(open.map((client) => client.disconnect().catch(() => undefined)));
  open = [];
});

async function pair(server: Parameters<typeof connectAs>[0], label: string) {
  const admin = await connectAs(server, 0, `${label}-admin`);
  open.push(admin);
  const guest = await connectAs(server, GUEST_IDENTITY, `${label}-guest`);
  open.push(guest);
  return { admin, guest };
}

test("the database id of another client is known from its enter view and from clientinfo", async ({ server, query }) => {
  const admin = await connectAs(server, 0, "dbid-admin");
  open.push(admin);
  const entered: { id: number; databaseId?: bigint }[] = [];
  admin.on("clientEnter", (client: { id: number; databaseId?: bigint }) => entered.push(client));
  const guest = await connectAs(server, GUEST_IDENTITY, "dbid-guest");
  open.push(guest);

  const cldbid = await databaseIdOf(query, (await query.call("clientinfo", { clid: guest.getClientId() }))[0]!.client_unique_identifier);
  const [info] = await send(admin, clientInfo(guest.getClientId()));
  expect(info!.client_database_id).toBe(cldbid);
  const seen = await poll(
    async () => entered.find((client) => client.id === guest.getClientId()),
    (found) => found !== undefined,
    { message: "the enter view of the guest" },
  );
  expect(seen!.databaseId).toBe(BigInt(cldbid));
});

test("a kick from the channel moves the guest to the default channel and leaves it connected", async ({ server, query, testChannel }) => {
  const room = await testChannel("real-kick-channel");
  const { admin, guest } = await pair(server, "kick-channel");
  const left = leaveCodes(guest);
  await guest.switchChannel(BigInt(room.id));
  await poll(
    async () => (await query.call("clientinfo", { clid: guest.getClientId() }))[0]!.cid,
    (cid) => cid === room.id,
    { message: "the guest to be in the room" },
  );

  await send(admin, clientKick(guest.getClientId(), "channel", "calm down"));

  const cid = await poll(
    async () => (await query.call("clientinfo", { clid: guest.getClientId() }))[0]!.cid,
    (current) => current !== room.id,
    { message: "the guest to leave the room" },
  );
  const [channel] = await query.call("channelinfo", { cid });
  expect(channel!.channel_flag_default).toBe("1");
  expect(guest.isConnected()).toBe(true);
  expect(left).toEqual([]);
});

test("a kick from the server disconnects the guest and tells it so", async ({ server, query }) => {
  const { admin, guest } = await pair(server, "kick-server");
  const left = leaveCodes(guest);

  await send(admin, clientKick(guest.getClientId(), "server", "too loud"));

  await poll(
    async () => left,
    (codes) => codes.length > 0,
    { message: "the guest to be told about the kick" },
  );
  expect(left).toEqual(["kicked"]);
  expect((await query.call("clientlist")).some((row) => row.clid === String(guest.getClientId()))).toBe(false);
});

const uidOf = async (query: WebQuery, client: TSClient) =>
  (await query.call("clientinfo", { clid: client.getClientId() }))[0]!.client_unique_identifier!;

test("a ban by UID disconnects the guest, bans the identity only and refuses its return", async ({ server, query }) => {
  const { admin, guest } = await pair(server, "ban-timed");
  const uid = await uidOf(query, guest);
  const left = leaveCodes(guest);

  await send(admin, banUid(uid, 3600, "spam"));

  const bans = await query.call("banlist");
  expect(bans).toHaveLength(1);
  expect(bans[0]).toMatchObject({ uid, ip: "", reason: "spam", duration: "3600" });
  await poll(
    async () => left,
    (codes) => codes.length > 0,
    { message: "the guest to be told about the ban" },
  );
  expect(left).toEqual(["banned"]);
  expect(guest.isConnected()).toBe(false);
  const again = await connectAs(server, GUEST_IDENTITY, "ban-again").then(
    (client) => {
      open.push(client);
      return "connected";
    },
    () => "refused",
  );
  expect(again).toBe("refused");
  // Nobody else is affected: the address is not banned.
  open.push(await connectAs(server, 1, "ban-bystander"));
});

test("a ban with time 0 is permanent", async ({ server, query }) => {
  const { admin, guest } = await pair(server, "ban-forever");

  await send(admin, banUid(await uidOf(query, guest), 0));

  const bans = await query.call("banlist");
  expect(bans).toHaveLength(1);
  expect(bans[0]).toMatchObject({ ip: "", duration: "0" });
});

test("the refusal of a banned identity says how long the ban lasts, timed, long or for good", async ({ server, query }) => {
  const admin = await connectAs(server, 0, "notice-admin");
  open.push(admin);
  const uid = identities.get(GUEST_IDENTITY).uid;
  // The server's own wording rides along, so a notice we do not read shows what it said.
  const refusalOf = async (seconds: number) => {
    await send(admin, banUid(uid, seconds, "notice"));
    const refusal = await connectAs(server, GUEST_IDENTITY, "notice-guest").then(
      (client) => {
        open.push(client);
        return undefined;
      },
      (error: unknown) => normalizeTeamSpeakError(error),
    );
    await query.call("bandelall");
    return { left: refusal?.diagnostics.banSeconds, said: JSON.stringify(refusal?.diagnostics.extraMessage) };
  };
  const expectLeft = async (seconds: number) => {
    const { left, said } = await refusalOf(seconds);
    expect.soft(typeof left, `${seconds} s, the server said ${said}`).toBe("number");
    if (left === undefined) return;
    expect.soft(left, `${seconds} s`).toBeGreaterThan(seconds - 100);
    expect.soft(left, `${seconds} s`).toBeLessThanOrEqual(seconds);
  };

  await expectLeft(3600);
  await expectLeft(25 * 3600);
  await expectLeft(7 * 86400);
  const forGood = await refusalOf(0);
  expect.soft(forGood.left, `for good, the server said ${forGood.said}`).toBe(0);
});

test("the server takes a kick and a ban reason as long as the gateway allows", async ({ server, query }) => {
  const reason = "r".repeat(MAX_MODERATION_REASON_LENGTH);
  const { admin, guest } = await pair(server, "reason-length");
  const uid = await uidOf(query, guest);

  await send(admin, banUid(uid, 3600, reason));
  expect((await query.call("banlist"))[0]!.reason).toBe(reason);

  const other = await connectAs(server, 1, "reason-length-other");
  open.push(other);
  await send(admin, clientKick(other.getClientId(), "server", reason));
});

test("a server group is added to and taken from a client by database id", async ({ server, query }) => {
  const { admin, guest } = await pair(server, "group-server");
  const [info] = await send(admin, clientInfo(guest.getClientId()));
  const cldbid = BigInt(info!.client_database_id!);
  const normal = (await query.call("servergrouplist")).find((row) => row.name === "Normal" && row.type === "1")!;
  const groupsOf = async () => (await query.call("servergroupsbyclientid", { cldbid: String(cldbid) })).map((row) => row.sgid);

  await send(admin, serverGroupAddClient(Number(normal.sgid), cldbid));
  expect(await groupsOf()).toContain(normal.sgid);

  await send(admin, serverGroupDelClient(Number(normal.sgid), cldbid));
  expect(await groupsOf()).not.toContain(normal.sgid);
});

test("a channel group is set per channel, and the default group takes it back", async ({ server, query, testChannel }) => {
  const room = await testChannel("real-group-channel");
  const { admin, guest } = await pair(server, "group-channel");
  const [info] = await send(admin, clientInfo(guest.getClientId()));
  const cldbid = BigInt(info!.client_database_id!);
  const [serverInfo] = await query.call("serverinfo");
  const defaultId = serverInfo!.virtualserver_default_channel_group!;
  const regular = (await query.call("channelgrouplist")).find((row) => row.type === "1" && row.cgid !== defaultId)!;
  const groupIn = async () =>
    (await query.call("channelgroupclientlist", { cid: room.id, cldbid: String(cldbid) })).map((row) => row.cgid)[0];

  await send(admin, setClientChannelGroup(Number(regular.cgid), BigInt(room.id), cldbid));
  expect(await groupIn()).toBe(regular.cgid);

  await send(admin, setClientChannelGroup(Number(defaultId), BigInt(room.id), cldbid));
  expect(await groupIn()).not.toBe(regular.cgid);
});
