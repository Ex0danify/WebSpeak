import { expect, test } from "./fixtures";
import { AudioCounters, expectQuiet } from "./counters";
import { openMemberMenu, withAudioTone } from "../helpers";
import { clientIdOf, menuAction } from "./ui";

// Whisper through the real server. Every fake microphone plays a steady 1000 Hz tone, so each browser talks all the time and
// what changes is where Alice's voice goes. While she holds the whisper button it goes to her target only. Counts are the
// gateway's per-source counters (admin sessions API), keyed by TeamSpeak client id.
test.use(withAudioTone({ frequencyHz: 1000 }));

test("holding the whisper button sends Alice's voice to her target and not to her channel, and releasing it undoes that", async ({
  person,
  testChannel,
  gateway,
  query,
}) => {
  const home = await testChannel("real-whisper-home");
  const away = await testChannel("real-whisper-away");
  const alice = await person(0, "whisper-alice");
  const carol = await person(2, "whisper-carol");
  const bob = await person(1, "whisper-bob");
  await alice.join(home.name);
  await carol.join(home.name);
  await bob.join(away.name);
  const counters = await AudioCounters.of(gateway);
  const aliceId = await clientIdOf(query, alice.nickname);
  const heardFromAlice = async (who: string) => (await counters.read(who)).egressFramesByClient[aliceId] ?? 0;

  // Before: her channel hears her (Carol), the other channel does not (Bob).
  await counters.until(carol.nickname, (audio) => (audio.egressFramesByClient[aliceId] ?? 0) >= 25);
  expect(await heardFromAlice(bob.nickname)).toBe(0);

  await menuAction(await openMemberMenu(alice.page, bob.nickname), "Set as whisper target").click();
  const strip = alice.page.getByText("Whisper targets", { exact: true });
  await expect(strip).toBeVisible();
  await expect(alice.page.getByText(bob.nickname, { exact: true }).last()).toBeVisible();

  const hold = alice.page.getByRole("button", { name: "Hold to whisper" });
  await hold.hover();
  await alice.page.mouse.down();
  await expect(alice.page.getByRole("button", { name: "Release to stop whispering" })).toBeVisible();
  await counters.until(bob.nickname, (audio) => (audio.egressFramesByClient[aliceId] ?? 0) >= 25, { message: "Bob to hear the whisper" });
  await expectQuiet(() => heardFromAlice(carol.nickname), "Carol hearing Alice while she whispers");
  const whileWhispering = await heardFromAlice(bob.nickname);

  await alice.page.mouse.up();
  await expect(alice.page.getByRole("button", { name: "Hold to whisper" })).toBeVisible();
  await expectQuiet(() => heardFromAlice(bob.nickname), "Bob hearing Alice after she let go");
  expect(await heardFromAlice(bob.nickname)).toBeGreaterThanOrEqual(whileWhispering);
  const before = await heardFromAlice(carol.nickname);
  await counters.until(carol.nickname, (audio) => (audio.egressFramesByClient[aliceId] ?? 0) >= before + 25, {
    message: "Carol to hear Alice again",
  });
});
