import { memberRow, withAudioTone } from "../helpers";
import { expect, test } from "./fixtures";
import { clientIdOf } from "./ui";

// A moderated channel drops the voice of someone below its needed talk power without an answer. The own indicator follows
// what the gateway forwards and the channel lets through, not the browser's microphone.
test.use(withAudioTone({ frequencyHz: 1000 }));

test("the own speaking indicator stays off in a moderated channel and lights up once talk power is granted", async ({ person, query }) => {
  const name = `real-moderated-${Date.now()}`;
  const cid = await query.createChannel(name, { channel_needed_talk_power: 100 });
  try {
    const alice = await person(0, "tp-alice");
    const bob = await person(1, "tp-bob");
    await alice.join(name);
    await bob.join(name);
    const own = memberRow(alice.page, alice.nickname);

    await expect(own.getByRole("img", { name: "No talk power" })).toBeVisible();
    await alice.session.waitForBinary(25, "sent");
    await alice.page.waitForTimeout(1500);
    await expect(own.getByText("Speaking…")).toBeHidden();
    await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeHidden();

    await query.call("clientedit", { clid: await clientIdOf(query, alice.nickname), client_is_talker: 1 });
    await expect(own.getByText("Speaking…")).toBeVisible();
    await expect(own.getByRole("img", { name: "No talk power" })).toBeHidden();
    await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeVisible();
  } finally {
    await query.call("channeldelete", { cid, force: 1 });
  }
});
