import { expect, test } from "@playwright/test";
import { ADMIN_IDENTITIES, GUEST_IDENTITY, identities } from "./identities";
import { databaseIdOf, probeRights, serverAdminGroup } from "./provision";
import { WebQuery, realServerFromEnv } from "./server";

// What global setup provisioned, meaning rights follow the seeded identity's UID.
const server = realServerFromEnv();
const query = WebQuery.for(server);

test("the admin identities are in Server Admin by UID and the guest identity is not", async () => {
  const members = (await query.call("servergroupclientlist", { sgid: await serverAdminGroup(query) })).map((row) => row.cldbid);
  for (let index = 0; index < ADMIN_IDENTITIES; index++) {
    expect(members, `identity ${index}`).toContain(await databaseIdOf(query, identities.get(index).uid));
  }
  expect(members).not.toContain(await databaseIdOf(query, identities.get(GUEST_IDENTITY).uid));
});

test("an admin identity still moves members on a new connection, and a guest is still refused", async () => {
  await probeRights(server, query);
});
