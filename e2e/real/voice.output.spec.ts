import type { Page } from "@playwright/test";
import { memberRow, openMemberMenu, openSettings, poll, withAudioTone } from "../helpers";
import { PROBE_SPEAKER_ID, installProbes, notifications, silentGains, sinkCalls } from "./probes";
import { expect, test } from "./fixtures";
import { menuAction, say } from "./ui";

// The output side of the browser through the real server, meaning the notification beeps, the loudspeaker gain of "Mute all
// audio" and the output-device choice. A test cannot judge how it sounds, but it sees which beep, gain node and device id the
// page used (`probes.ts`).

// Both fake microphones play a steady tone, so there is a speaker to mute (see voice.spec.ts).
test.use(withAudioTone({ frequencyHz: 1000 }));

const dock = (page: Page) => page.getByRole("toolbar", { name: "Audio controls" });

const CONNECTED: number[] = [660, 880];
const POKE: number[] = [740, 980];
const PRIVATE: number[] = [600, 760];

/** The `nth` poke of this page (1-based): each one leaves its "Poke sent" toast, so the count is what tells them apart. */
async function poke(page: Page, nickname: string, nth: number): Promise<void> {
  page.once("dialog", (dialog) => dialog.accept("beep"));
  await menuAction(await openMemberMenu(page, nickname), "Poke").click();
  await expect(page.getByText("Poke sent", { exact: true })).toHaveCount(nth);
}

async function nextBeep(page: Page, already: number): Promise<number[]> {
  const beeps = await poll(
    () => notifications(page),
    (list) => list.length > already,
    { message: "a notification beep" },
  );
  return beeps[already];
}

test("joining, a poke and a private message each play their own beep, and Mute all audio silences the next one", async ({
  person,
  testChannel,
}) => {
  const room = await testChannel("real-beeps");
  const bob = await person(1, "beep-bob");
  const alice = await person(0, "beep-alice");
  await installProbes(bob.page);
  await bob.join(room.name);
  await alice.join(room.name);

  // Bob's own arrival is the first beep; Alice's arrival makes none.
  expect(await nextBeep(bob.page, 0)).toEqual(CONNECTED);

  await poke(alice.page, bob.nickname, 1);
  expect(await nextBeep(bob.page, 1)).toEqual(POKE);

  await menuAction(await openMemberMenu(alice.page, bob.nickname), "Private message").click();
  await say(alice.page, "psst");
  expect(await nextBeep(bob.page, 2)).toEqual(PRIVATE);

  // Muted, the poke still arrives as a banner but nothing is played.
  await dock(bob.page).getByRole("button", { name: "Mute all audio" }).click();
  await expect(dock(bob.page).getByRole("button", { name: "Restore audio" })).toHaveAttribute("aria-pressed", "true");
  await poke(alice.page, bob.nickname, 2);
  await expect(bob.page.getByRole("status").filter({ hasText: "poked you" })).toHaveCount(2);
  expect(await notifications(bob.page)).toHaveLength(3);
});

test("a notification volume of zero plays nothing", async ({ person, testChannel }) => {
  const room = await testChannel("real-beeps-off");
  const bob = await person(1, "beep-off-bob");
  const alice = await person(0, "beep-off-alice");
  await installProbes(bob.page);
  await bob.join(room.name);
  await alice.join(room.name);
  const beeps = (
    await poll(
      () => notifications(bob.page),
      (list) => list.length > 0,
      { message: "the join beep" },
    )
  ).length;

  const { dialog } = await openSettings(bob.page);
  // A custom slider, not an input: the keyboard moves it, and Home is its minimum.
  const slider = dialog.getByRole("slider", { name: "Notification volume" });
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  await dialog.getByRole("button", { name: "Done" }).click();
  await poke(alice.page, bob.nickname, 1);
  await expect(bob.page.getByRole("status").filter({ hasText: "poked you" })).toHaveCount(1);
  expect(await notifications(bob.page)).toHaveLength(beeps);
});

test("Mute all audio sets the listener's loudspeaker gain to zero for the speaker, and Restore audio brings it back", async ({
  person,
}) => {
  // The gain lives inside the browser's AudioContext; the probe reads the nodes the page made.
  // Muting adds exactly one silent gain (Alice's playback node) to the ones that are silent anyway.
  const alice = await person(0, "gain-alice");
  const bob = await person(1, "gain-bob");
  await installProbes(bob.page);
  await alice.join();
  await bob.join();
  await bob.session.waitForBinary(25, "received");
  await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeVisible();
  const before = await silentGains(bob.page);

  await dock(bob.page).getByRole("button", { name: "Mute all audio" }).click();
  await poll(
    () => silentGains(bob.page),
    (count) => count === before + 1,
    { message: "the speaker's gain to go to zero" },
  );
  // Still arriving: only the loudspeaker is muted.
  await bob.session.waitForBinary(10, "received");

  await dock(bob.page).getByRole("button", { name: "Restore audio" }).click();
  await poll(
    () => silentGains(bob.page),
    (count) => count === before,
    { message: "the speaker's gain to come back" },
  );
});

test("choosing an output device hands its id to the browser and is remembered, and choosing the default sends 'default'", async ({
  person,
}) => {
  const bob = await person(1, "sink-bob");
  await installProbes(bob.page, { speakers: true });
  await bob.join();

  const { dialog } = await openSettings(bob.page);
  const select = dialog.getByLabel("Output device");
  await expect(select.locator(`option[value="${PROBE_SPEAKER_ID}"]`)).toHaveCount(1);
  await select.selectOption(PROBE_SPEAKER_ID);
  await poll(
    () => sinkCalls(bob.page),
    (calls) => calls.includes(PROBE_SPEAKER_ID),
    { message: "setSinkId with the chosen device" },
  );
  await expect(select).toHaveValue(PROBE_SPEAKER_ID);
  expect(await bob.page.evaluate(() => window.localStorage.getItem("webspeak:output-device"))).toBe(PROBE_SPEAKER_ID);

  await select.selectOption("");
  await poll(
    () => sinkCalls(bob.page),
    (calls) => calls.at(-1) === "default",
    { message: "setSinkId back to the default" },
  );
  expect(await bob.page.evaluate(() => window.localStorage.getItem("webspeak:output-device"))).toBe("");
});
