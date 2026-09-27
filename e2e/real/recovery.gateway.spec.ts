import { expect, test } from "./fixtures";
import { poll } from "../helpers";
import { channelIdOf } from "./ui";

// The gateway goes away under a live browser (step 5.7b). `Gateway.stop()` is as close to a kill as
// one process gets: the sockets close with 1001 and a reason ("gateway-shutdown", finding F17,
// fixed) and the TeamSpeak clients are disconnected. The expectation of the old smoke script (a
// reconnect banner that recovers by itself) does not hold: the browser has nothing to reconnect to,
// so it returns to the join form with the code of a gateway restart, not a lost connection. A new
// gateway has another port, hence another origin, so getting back in is not something this test can
// show.

test("a gateway that ends under a live browser returns it to the join form with a reason", async ({ person, ownGateway, query }) => {
  const gateway = await ownGateway();
  const alice = await person(0, "gw-down", { gateway });
  await alice.join();
  await poll(() => channelIdOf(query, alice.nickname), (cid) => cid !== undefined, { message: "the server to list Alice" });

  void gateway.stop().catch(() => undefined);

  await expect(alice.page.getByRole("button", { name: "Enter voice space" })).toBeVisible();
  await expect(alice.page.getByText("Error code: GATEWAY_RESTARTING")).toBeVisible();
  await expect(alice.page.getByLabel("Your nickname")).toHaveValue(alice.nickname);
  // Its TeamSpeak client left with it: the server does not keep a ghost of the session.
  await poll(() => channelIdOf(query, alice.nickname), (cid) => cid === undefined, { message: "the server to drop Alice's client when the gateway ended" });
});
