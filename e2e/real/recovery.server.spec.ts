import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectInRoom, poll } from "../helpers";
import { provisionServer } from "./provision";
import { type RealServer, WebQuery, startContainer, stopContainer, waitForQuery } from "./server";
import { channelIdOf } from "./ui";

// The TeamSpeak server stops under a live session (step 5.7c). The container is stopped and started
// again, and because its data directory is a tmpfs it comes back empty, so the test provisions it
// again like the global setup does (`provisionServer`) before the next test may rely on it.
//
// The gateway keeps trying for five minutes (`RECONNECT_WINDOW_MS`) unless the server refuses with
// an error that a retry cannot fix. The test makes it do that: the server comes back with a ban on
// the person's nickname, so the failed banner appears after about a minute and not after five. (A
// server password is the other refusal a retry cannot fix, but it opens the password dialog, not
// the banner.)

const reconnecting = (page: Page) => page.getByRole("status").filter({ hasText: "Connection interrupted" });
const failed = (page: Page) => page.getByRole("alert").filter({ hasText: "Could not restore the connection" });

/** Brings the server back as the other specs expect it. Safe to run when nothing went wrong. */
async function restoreServer(server: RealServer, query: WebQuery): Promise<void> {
  startContainer(server);
  await waitForQuery(server);
  const channels = await query.call("channellist");
  if (!channels.some((channel) => channel.channel_name === "Lobby")) await provisionServer(server, query);
  await query.call("bandelall");
}

test("a server that stops shows the reconnect banner, refusing it back ends in the failed banner, and Reconnect now gets the person back in", async ({ person, server, query }) => {
  test.setTimeout(180_000);
  const alice = await person(0, "srv-down");
  await alice.join();
  await poll(() => channelIdOf(query, alice.nickname), (cid) => cid !== undefined, { message: "the server to list Alice" });

  try {
    stopContainer(server);
    await expect(reconnecting(alice.page)).toContainText("Reconnecting… Attempt 1");
    // Attempts come 1, 2, 4, 8 and 15 seconds apart and then 30: once the sixth is announced the
    // next connect is half a minute away, which is time to bring the server up with the ban.
    await expect(reconnecting(alice.page)).toContainText("Reconnecting… Attempt 6", { timeout: 60_000 });
    startContainer(server);
    await waitForQuery(server);
    await query.call("banadd", { name: alice.nickname, banreason: "real-server recovery test", time: 600 });

    await expect(failed(alice.page)).toContainText("You are banned from this server", { timeout: 60_000 });
    await expect(reconnecting(alice.page)).toBeHidden();
    await expect(failed(alice.page).getByRole("button", { name: "Back" })).toBeVisible();

    // The ban is lifted (and the empty server set up again), so a new join can succeed.
    await restoreServer(server, query);
    await alice.page.getByRole("button", { name: "Reconnect now" }).click();
    await expectInRoom(alice.page, alice.nickname);
    await expect(failed(alice.page)).toBeHidden();
    await poll(() => channelIdOf(query, alice.nickname), (cid) => cid !== undefined, { message: "the restarted server to list Alice" });
  } finally {
    // After a failure the server may still be stopped or banned. Its own error must not replace the
    // test's, and a server that stays broken fails the specs after this one loudly.
    await restoreServer(server, query).catch((error: Error) => process.stderr.write(`note: restoring the server failed: ${error.message}\n`));
  }
});
