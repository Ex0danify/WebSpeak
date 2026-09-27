import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { TSClient } from "../../src/server/ts-client";
import { memberRow, poll } from "../helpers";
import { JOIN_PACE_MS, expect, test } from "./fixtures";
import { connectAs } from "./provision";

// The rules every real-server test stands on (step 5.3): paced joins, a unique nickname and channel
// per test, and a server and gateway that are clean again after each test. The two tests run in
// file order (one worker, `fullyParallel: false`), the second checks what the first left behind.

// Playwright starts a new worker after a failed test, so what test 1 made is handed over in a file
// (in the run directory of the server), not in a variable.
const handover = (runDir: string) => `${runDir}/isolation-channel.txt`;

test("two people join through the form, paced, and see each other", async ({ person, testChannel, query, gateway, server }) => {
  rmSync(handover(server.runDir), { force: true });
  const alice = await person(0, "alice");
  const bob = await person(1, "bob");
  const channelOfFirstTest = (await testChannel("iso")).name;
  writeFileSync(handover(server.runDir), channelOfFirstTest);
  expect((await query.call("channellist")).map((c) => c.channel_name)).toContain(channelOfFirstTest);

  await alice.join();
  await bob.join();
  expect(bob.joinStartedAt! - alice.joinStartedAt!).toBeGreaterThanOrEqual(JOIN_PACE_MS);
  expect(alice.nickname).not.toBe(bob.nickname);

  await expect(memberRow(alice.page, bob.nickname)).toBeVisible();
  await expect(memberRow(bob.page, alice.nickname)).toBeVisible();
  const sessions = ((await (await (await gateway.adminLogin()).get("sessions")).json()) as { sessions: unknown[] }).sessions;
  expect(sessions).toHaveLength(2);
});

test("the next test finds no session, no client and no channel of the previous one", async ({ query, gateway, server }) => {
  expect(existsSync(handover(server.runDir)), "the first test did not get as far as making its channel").toBe(true);
  const channelOfFirstTest = readFileSync(handover(server.runDir), "utf8");
  const sessions = ((await (await (await gateway.adminLogin()).get("sessions")).json()) as { sessions: unknown[] }).sessions;
  expect(sessions).toHaveLength(0);
  const clients = (await query.call("clientlist")).filter((c) => c.client_type === "0");
  expect(clients).toEqual([]);
  expect((await query.call("channellist")).map((c) => c.channel_name)).not.toContain(channelOfFirstTest);
});

// The cleanup also puts back a client that no browser of the test owns (another client the test
// made). Test 3 leaves one in a channel of its own, test 4 finds it in Lobby and removes it.
let stray: TSClient | undefined;

test("a client the test leaves in another channel is put back in Lobby afterwards", async ({ person, testChannel, server, query }) => {
  await person(0, "idle"); // the cleanup belongs to the `person` fixture
  const channel = await testChannel("stray");
  stray = await connectAs(server, 2, "stray-ghost");
  await stray.switchChannel(BigInt(channel.id));
  const ghost = (await query.call("clientlist")).find((c) => c.client_nickname === "stray-ghost");
  expect(ghost?.cid).toBe(channel.id);
});

test("the stray client of the previous test is in Lobby", async ({ query }) => {
  const ghost = (await query.call("clientlist")).find((c) => c.client_nickname === "stray-ghost");
  expect(ghost, "the previous test did not leave its stray client on the server").toBeDefined();
  const lobby = (await query.call("channellist")).find((c) => c.channel_name === "Lobby");
  expect(ghost!.cid).toBe(lobby!.cid);
  await stray?.disconnect();
  await poll(
    async () => (await query.call("clientlist")).some((c) => c.client_nickname === "stray-ghost"),
    (present) => !present,
    { timeoutMs: 10_000, message: "the stray client to leave the server" },
  );
});
