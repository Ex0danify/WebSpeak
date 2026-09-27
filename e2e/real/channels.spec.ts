import { channelGroup, memberRow, poll } from "../helpers";
import { expect, test } from "./fixtures";
import { channelIdOf, channelWith } from "./ui";

// Channels through the real server (step 5.5): where a person lands, switching by click, and the
// member counts staying true in every browser. Each test builds its own channels (removed after),
// so a count is only ever of the people the test put there.

test("the target channel of the form is where the person lands, on the server and in the tree", async ({ person, testChannel, query }) => {
  const room = await testChannel("real-land");
  const alice = await person(0, "land-alice");
  await alice.join(room.name);

  await poll(() => channelIdOf(query, alice.nickname), (cid) => cid === room.id, { message: "the server to have Alice in her target channel" });
  await expect(channelWith(alice.page, room.name, 1)).toBeVisible();
  await expect(channelGroup(alice.page, room.name).getByText(`${alice.nickname} (You)`, { exact: true })).toBeVisible();
});

test("switching by click moves the member on the server, and the counts follow in both browsers", async ({ person, testChannel, query }) => {
  const home = await testChannel("real-home");
  const away = await testChannel("real-away");
  const alice = await person(0, "switch-alice");
  const bob = await person(1, "switch-bob");
  await alice.join(home.name);
  await bob.join(away.name);
  for (const { page } of [alice, bob]) {
    await expect(channelWith(page, home.name, 1)).toBeVisible();
    await expect(channelWith(page, away.name, 1)).toBeVisible();
  }

  await alice.page.getByRole("button", { name: `${away.name} 1`, exact: true }).click();
  await poll(() => channelIdOf(query, alice.nickname), (cid) => cid === away.id, { message: "the server to move Alice" });
  for (const { page } of [alice, bob]) {
    await expect(channelWith(page, away.name, 2)).toBeVisible();
    await expect(channelWith(page, home.name, 0)).toBeVisible();
  }
  await expect(channelGroup(bob.page, away.name).getByText(alice.nickname, { exact: true })).toBeVisible();

  await alice.page.getByRole("button", { name: `${home.name} 0`, exact: true }).click();
  await poll(() => channelIdOf(query, alice.nickname), (cid) => cid === home.id, { message: "the server to move Alice back" });
  for (const { page } of [alice, bob]) {
    await expect(channelWith(page, away.name, 1)).toBeVisible();
    await expect(channelWith(page, home.name, 1)).toBeVisible();
  }
});

test("a member moved on the server shows up in the new channel in every browser", async ({ person, testChannel, query }) => {
  const home = await testChannel("real-moved-from");
  const away = await testChannel("real-moved-to");
  const alice = await person(0, "moved-alice");
  const bob = await person(1, "moved-bob");
  await alice.join(home.name);
  await bob.join(home.name);
  await expect(channelWith(alice.page, home.name, 2)).toBeVisible();

  // Someone else's doing, from outside every browser: a ServerQuery move.
  const clid = (await query.call("clientlist")).find((client) => client.client_nickname === bob.nickname)!.clid;
  await query.call("clientmove", { clid, cid: away.id });

  for (const { page } of [alice, bob]) {
    await expect(channelWith(page, home.name, 1)).toBeVisible();
    await expect(channelWith(page, away.name, 1)).toBeVisible();
  }
  await expect(channelGroup(alice.page, away.name).getByText(bob.nickname, { exact: true })).toBeVisible();
  await expect(memberRow(alice.page, bob.nickname)).toBeVisible();
});
