import { identityFromString } from "@echosixhiya/teamspeak-client";
import { TSClient } from "../../src/modules/teamspeak/teamSpeakClient";
import { poll } from "../helpers/poll";
import { ADMIN_IDENTITIES, GUEST_IDENTITY, type IdentityStore, identities } from "./identities";
import { type RealServer, WebQuery, silentLogger } from "./server";

/** A gateway client of this server with seeded identity number `index`. Connected. */
export async function connectAs(server: RealServer, index: number, nickname: string, store: IdentityStore = identities): Promise<TSClient> {
  const client = new TSClient(
    { target: { host: server.host, port: server.voicePort }, nickname, identity: identityFromString(store.get(index).privateMaterial) },
    silentLogger,
  );
  await client.connect();
  return client;
}

export async function serverAdminGroup(query: WebQuery): Promise<string> {
  const groups = await query.call("servergrouplist");
  const admin = groups.find((g) => g.name === "Server Admin" && g.type === "1");
  if (!admin) throw new Error(`No "Server Admin" group on the test server; groups: ${groups.map((g) => g.name).join(", ")}`);
  return admin.sgid;
}

/**
 * The database id of a UID, only known once that identity has connected once. Reads the whole client database instead of
 * `clientdbfind` and waits for a client that just disconnected. A miss lists the UIDs the server has, so a wrongly computed UID
 * shows.
 */
export async function databaseIdOf(query: WebQuery, uid: string): Promise<string> {
  const list = () => query.call("clientdblist", { start: 0, duration: 200 });
  const rows = await poll(list, (found) => found.some((r) => r.client_unique_identifier === uid), {
    timeoutMs: 5000,
    message: `UID ${uid} in the client database`,
  }).catch(async (error: Error) => {
    const seen = (await list()).map((r) => `${r.cldbid}:${r.client_unique_identifier}:${r.client_nickname}`);
    throw new Error(`${error.message}\nThe server knows: ${seen.join(", ") || "(nobody)"}`);
  });
  return rows.find((r) => r.client_unique_identifier === uid)!.cldbid;
}

/**
 * Server groups follow the UID, so rights granted to a seeded identity outlive its connections. Each admin identity connects
 * once so the server knows it, the reported UID must match the computed one, then the group is granted by database id.
 */
export async function grantServerAdmin(server: RealServer, query: WebQuery, store: IdentityStore = identities): Promise<void> {
  const sgid = await serverAdminGroup(query);
  for (let index = 0; index < ADMIN_IDENTITIES; index++) {
    const client = await connectAs(server, index, `grant-${index}`, store);
    await client.disconnect();
    const uid = store.get(index).uid;
    const cldbid = await databaseIdOf(query, uid);
    const [info] = await query.call("clientdbinfo", { cldbid });
    if (info.client_unique_identifier !== uid)
      throw new Error(`Identity ${index}: the server reports UID ${info.client_unique_identifier}, the identity computes ${uid}`);
    await query.call("servergroupaddclient", { sgid, cldbid });
  }
}

/**
 * Asserts the grant took effect by what it is for, an admin identity moves another client and an ordinary one is refused.
 * and an ordinary one is refused. Throws with the reason otherwise.
 */
export async function probeRights(server: RealServer, query: WebQuery, store: IdentityStore = identities): Promise<void> {
  const admin = await connectAs(server, 0, "probe-admin", store);
  const guest = await connectAs(server, GUEST_IDENTITY, "probe-guest", store);
  const target = await query.createChannel("Probe rights");
  try {
    await admin.moveClient(guest.getClientId(), BigInt(target));
    await poll(
      async () => (await query.call("clientlist")).find((c) => c.clid === String(guest.getClientId()))?.cid,
      (cid) => cid === target,
      { message: "the probe guest to be moved by the admin identity" },
    );
    const refused = await guest.moveClient(admin.getClientId(), BigInt(target)).then(
      () => false,
      () => true,
    );
    if (!refused) throw new Error("A guest identity was allowed to move another client: the test server gives everyone move rights");
  } finally {
    await admin.disconnect();
    await guest.disconnect();
    await query.call("channeldelete", { cid: target, force: 1 });
  }
}

/**
 * Everything a spec expects of a fresh server, and the one place that knows it. Raises the flood limits (the server bans an
 * address after about ten joins in three minutes), sets up the lobby and the admin rights. Runs in global setup and after a
 * server restart.
 */
export async function provisionServer(server: RealServer, query: WebQuery, extra: Record<string, string | number> = {}): Promise<void> {
  await query.call("serveredit", {
    virtualserver_antiflood_points_tick_reduce: 1000,
    virtualserver_antiflood_points_needed_command_block: 1_000_000,
    virtualserver_antiflood_points_needed_ip_block: 1_000_000,
    ...extra,
  });
  await query.createChannel("Lobby");
  await grantServerAdmin(server, query);
  await probeRights(server, query);
}
