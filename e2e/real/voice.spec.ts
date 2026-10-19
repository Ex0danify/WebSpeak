import type { Locator, Page } from "@playwright/test";
import { memberRow, poll, withAudioTone } from "../helpers";
import { AudioCounters, expectQuiet } from "./counters";
import { expect, test, type Person } from "./fixtures";
import { clientIdOf } from "./ui";

// Voice through the real TeamSpeak server. Both browsers' fake microphones play a steady 1000 Hz tone, so audio flows until
// muted. Asserts what the gateway counts (the admin sessions API) and what the browsers see, never what a socket sniffer
// decodes.
test.use(withAudioTone({ frequencyHz: 1000 }));

const dock = (page: Page): Locator => page.getByRole("toolbar", { name: "Audio controls" });

/** Two people in the server's default channel, Alice first. */
async function twoInARoom(person: (index: number, label: string) => Promise<Person>): Promise<{ alice: Person; bob: Person }> {
  const alice = await person(0, "voice-alice");
  const bob = await person(1, "voice-bob");
  await alice.join();
  await bob.join();
  return { alice, bob };
}

test("a tone from one client reaches the other: Opus frames, the speaking indicator and the gateway's counters agree", async ({
  person,
  gateway,
}) => {
  const { alice, bob } = await twoInARoom(person);
  const counters = await AudioCounters.of(gateway);

  await alice.session.waitForBinary(25, "sent");
  await bob.session.waitForBinary(25, "received");
  await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeVisible();
  await expect(memberRow(alice.page, bob.nickname).getByText("Speaking…")).toBeVisible();

  // Alice's session: PCM in, Opus to TeamSpeak, nothing lost on the way.
  const up = await counters.until(alice.nickname, (audio) => audio.ingressFrames >= 25 && audio.tsSendFrames >= 25);
  expect(up.ingressDroppedFrames).toBe(0);
  expect(up.tsSendErrors).toBe(0);
  // Bob's session: what TeamSpeak delivered was relayed to the browser, and nothing was dropped.
  const down = await counters.until(bob.nickname, (audio) => audio.tsReceiveFrames >= 25 && audio.egressFrames >= 25);
  expect(down.egressDroppedFrames).toBe(0);
  expect(Object.keys(down.egressFramesByClient)).toHaveLength(1);
  expect(alice.session.pageErrors).toEqual([]);
  expect(bob.session.pageErrors).toEqual([]);
});

test("muting the microphone stops the voice at the browser, the gateway and the listener, and unmuting brings it back", async ({
  person,
  gateway,
}) => {
  const { alice, bob } = await twoInARoom(person);
  const counters = await AudioCounters.of(gateway);
  await bob.session.waitForBinary(25, "received");
  await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeVisible();

  await dock(alice.page).getByRole("button", { name: "Microphone on" }).click();
  await expect(dock(alice.page).getByRole("button", { name: "Microphone off" })).toBeVisible();
  await expectQuiet(() => alice.session.binarySent, "Alice's uplink");
  await expectQuiet(async () => (await counters.read(alice.nickname)).ingressFrames, "Alice's frames at the gateway");
  await expectQuiet(() => bob.session.binaryReceived, "the voice reaching Bob");
  await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeHidden();
  const whileMuted = await counters.read(alice.nickname);

  await dock(alice.page).getByRole("button", { name: "Microphone off" }).click();
  await alice.session.waitForBinary(10, "sent");
  await bob.session.waitForBinary(10, "received");
  await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeVisible();
  expect((await counters.read(alice.nickname)).ingressFrames).toBeGreaterThan(whileMuted.ingressFrames);
});

test("Mute all audio deafens the listener on the server, which stops the voice to them, and Restore audio brings it back", async ({
  person,
  gateway,
  query,
}) => {
  // Muting sends TeamSpeak's output-muted flag, so others see the listener deafened and the server stops forwarding voice to them.
  const { alice, bob } = await twoInARoom(person);
  const counters = await AudioCounters.of(gateway);
  await bob.session.waitForBinary(10, "received");
  const outputMuted = async () => {
    const [info] = await query.call("clientinfo", { clid: await clientIdOf(query, bob.nickname) });
    return info?.client_output_muted;
  };

  await dock(bob.page).getByRole("button", { name: "Mute all audio" }).click();
  await expect(dock(bob.page).getByRole("button", { name: "Restore audio" })).toHaveAttribute("aria-pressed", "true");
  await poll(outputMuted, (flag) => flag === "1", { message: "the server to show Bob deafened" });
  await expectQuiet(async () => (await counters.read(bob.nickname)).tsReceiveFrames, "the voice TeamSpeak sends to Bob");
  await alice.session.waitForBinary(10, "sent");

  await dock(bob.page).getByRole("button", { name: "Restore audio" }).click();
  await expect(dock(bob.page).getByRole("button", { name: "Mute all audio" })).toHaveAttribute("aria-pressed", "false");
  await poll(outputMuted, (flag) => flag === "0", { message: "the server to show Bob listening again" });
  await bob.session.waitForBinary(10, "received");
});
