import { expect, test } from "./fixtures";
import { poll } from "../helpers";
import { channelIdOf } from "./ui";
import type { WebQuery } from "./server";

// Step 5.8: a person who comes back gets the identity they had, so the server groups that follow
// the UID are still theirs. This is what F1 breaks: the client restores a stored identity only
// when `webspeak:remember-identity` is "1", and writes that key only when the checkbox is toggled,
// so a browser that never touched it joins as a new client every time. Every other spec of this
// layer seeds that key (5.2) and so cannot see it; this one uses a browser with nothing stored.

/** The UID the server reports for a connected nickname (`clientinfo`, as the provisioning reads it). */
async function uidOf(query: WebQuery, nickname: string): Promise<string> {
  const clid = await poll(
    async () => (await query.call("clientlist")).find((client) => client.client_nickname === nickname)?.clid,
    (found) => found !== undefined,
    { message: `the server to list ${nickname}` },
  );
  const [info] = await query.call("clientinfo", { clid: clid! });
  return info.client_unique_identifier;
}

test("a browser that joins, leaves and joins again has the same TeamSpeak UID both times (F1)", async ({ person, query }) => {
  // F1 is a bug that this phase does not fix (docs/testing/findings.md): the second UID differs,
  // so the correct expectation is marked as failing. When 7.1 lands this goes red; drop test.fail().
  test.fail();
  const alice = await person(0, "identity", { seeded: false });
  await alice.join();
  const first = await uidOf(query, alice.nickname);

  await alice.page.getByRole("button", { name: "Exit", exact: true }).click();
  await expect(alice.page.getByRole("button", { name: "Enter voice space" })).toBeVisible();
  await poll(() => channelIdOf(query, alice.nickname), (cid) => cid === undefined, { message: "the server to drop Alice's client after Exit" });

  await alice.join();
  expect(await uidOf(query, alice.nickname)).toBe(first);
});
