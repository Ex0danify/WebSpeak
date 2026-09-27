import type { Locator, Page } from "@playwright/test";
import { launchOptions, poll } from "../helpers";
import { expect, test, type Person } from "./fixtures";

// Screen share through the real TeamSpeak server (step 5.6). The share itself is WebRTC between the
// two browsers (the gateway relays the signalling and announces the share to TeamSpeak), so what a
// test can see is what a person sees: the card of the sharer, the viewer with a playing video, and
// both sides clearing when the share stops. Chromium's fake-device flags make `getDisplayMedia`
// answer with a generated picture and no picker; the rest of the flags are the ones the G-SMOKE
// scripts needed to capture without asking (`e2e/legacy/screenshare2.mjs`).
test.use({
  launchOptions: launchOptions([
    "--auto-accept-this-tab-capture",
    "--auto-select-desktop-capture-source=Entire screen",
    "--enable-usermedia-screen-capturing",
    "--auto-select-tab-capture-source-by-title=WebSpeak",
  ]),
});

const shareSettings = (page: Page): Locator => page.getByRole("button", { name: "Share settings" });
const settingsDialog = (page: Page): Locator => page.getByRole("dialog", { name: "Share settings" });
const startButton = (page: Page): Locator => page.getByRole("button", { name: "Share screen" });
const stopButton = (page: Page): Locator => page.getByRole("button", { name: "Stop sharing" });
const watchButton = (page: Page): Locator => page.getByRole("button", { name: "Watch screen" });
const player = (page: Page): Locator => page.getByRole("region", { name: "Screen sharing" });
const volume = (page: Page): Locator => player(page).getByRole("slider", { name: "Share volume" });

interface VideoState {
  width: number;
  ready: number;
  paused: boolean;
  volume: number;
  time: number;
}

const videoState = (page: Page): Promise<VideoState | null> =>
  page.evaluate(() => {
    const video = document.querySelector("video");
    return video ? { width: video.videoWidth, ready: video.readyState, paused: video.paused, volume: video.volume, time: video.currentTime } : null;
  });

/** Two people in one channel of their own, Alice first. */
async function twoInARoom(person: (index: number, label: string) => Promise<Person>, channel: string): Promise<{ alice: Person; bob: Person }> {
  const alice = await person(0, "share-alice");
  const bob = await person(1, "share-bob");
  await alice.join(channel);
  await bob.join(channel);
  return { alice, bob };
}

/** Alice shares through the settings dialog and Bob starts watching; returns once Bob has live video. */
async function shareAndWatch(alice: Person, bob: Person): Promise<void> {
  await shareSettings(alice.page).click();
  await settingsDialog(alice.page).getByRole("button", { name: "Share screen" }).click();
  await expect(stopButton(alice.page)).toBeVisible();
  await watchButton(bob.page).click();
  await expect(player(bob.page)).toBeVisible();
  await poll(() => videoState(bob.page), (state) => state !== null && state.width > 0 && state.ready >= 2, { message: "Bob's video to have a picture" });
}

test("the settings dialog offers the output quality, and a share started from it reaches the other browser as live video", async ({ person, testChannel }) => {
  const room = await testChannel("real-share");
  const { alice, bob } = await twoInARoom(person, room.name);

  await shareSettings(alice.page).click();
  const dialog = settingsDialog(alice.page);
  await expect(dialog).toBeVisible();
  const resolution = dialog.getByLabel("Output resolution");
  const frameRate = dialog.getByLabel("Frame rate limit");
  await expect(resolution).toHaveValue("1080p");
  await expect(frameRate).toHaveValue("15");
  await resolution.selectOption({ label: "720p (up to 1280 × 720)" });
  await frameRate.selectOption({ label: "30 FPS" });
  // Cancel leaves nothing shared, and the choice is still there when the dialog is opened again.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(watchButton(bob.page)).toHaveCount(0);
  await shareSettings(alice.page).click();
  await expect(resolution.locator("option:checked")).toHaveText("720p (up to 1280 × 720)");
  await expect(frameRate.locator("option:checked")).toHaveText("30 FPS");

  await dialog.getByRole("button", { name: "Share screen" }).click();
  await expect(dialog).toBeHidden();
  await expect(stopButton(alice.page)).toBeVisible();
  await expect(alice.page.getByText("Live", { exact: true })).toBeVisible();
  await expect(watchButton(bob.page)).toBeVisible();
  await expect(bob.page.getByText("Live", { exact: true })).toBeVisible();

  await watchButton(bob.page).click();
  await expect(player(bob.page)).toBeVisible();
  const live = await poll(() => videoState(bob.page), (state) => state !== null && state.width > 0 && state.ready >= 2, { message: "Bob's video to have a picture" });
  expect(live?.paused).toBe(false);
  // The picture moves: the playback position advances.
  await poll(() => videoState(bob.page), (state) => state !== null && state.time > live!.time, { message: "Bob's video to keep playing" });
  await expect(bob.page.getByText("Watching", { exact: true }).first()).toBeVisible();

  expect(alice.session.pageErrors).toEqual([]);
  expect(bob.session.pageErrors).toEqual([]);
});

test("the share volume slider sets the volume of the video, and Exit viewer leaves the share running", async ({ person, testChannel }) => {
  const room = await testChannel("real-share-volume");
  const { alice, bob } = await twoInARoom(person, room.name);
  await shareAndWatch(alice, bob);

  await expect(volume(bob.page)).toHaveAttribute("aria-valuenow", "100");
  expect((await videoState(bob.page))?.volume).toBe(1);
  await volume(bob.page).focus();
  await bob.page.keyboard.press("Home");
  await poll(() => videoState(bob.page), (state) => state?.volume === 0, { message: "the video to be silent at 0%" });
  await bob.page.keyboard.press("ArrowRight");
  const raised = await poll(() => videoState(bob.page), (state) => state !== null && state.volume > 0, { message: "the video to get louder" });
  expect(raised?.volume).toBeLessThan(1);
  await bob.page.keyboard.press("End");
  await poll(() => videoState(bob.page), (state) => state?.volume === 1, { message: "the video to be at full volume at 100%" });

  await bob.page.getByRole("button", { name: "Exit viewer" }).click();
  await expect(player(bob.page)).toBeHidden();
  await expect(watchButton(bob.page)).toBeVisible();
  await expect(stopButton(alice.page)).toBeVisible();
  // Watching again works: the share never stopped.
  await watchButton(bob.page).click();
  await poll(() => videoState(bob.page), (state) => state !== null && state.width > 0 && state.ready >= 2, { message: "Bob's video to have a picture the second time" });
});

test("stopping the share clears the sharer's card and the viewer's player and button", async ({ person, testChannel }) => {
  const room = await testChannel("real-share-stop");
  const { alice, bob } = await twoInARoom(person, room.name);
  await shareAndWatch(alice, bob);

  await stopButton(alice.page).click();
  await expect(startButton(alice.page)).toBeVisible();
  await expect(stopButton(alice.page)).toHaveCount(0);
  await expect(alice.page.getByText("Live", { exact: true })).toHaveCount(0);
  await expect(player(bob.page)).toBeHidden();
  await expect(watchButton(bob.page)).toHaveCount(0);
  await expect(bob.page.getByText("Live", { exact: true })).toHaveCount(0);
  expect(await videoState(bob.page)).toBeNull();

  // The room is as it was: sharing again works and shows up for the viewer again.
  await startButton(alice.page).click();
  await expect(stopButton(alice.page)).toBeVisible();
  await expect(watchButton(bob.page)).toBeVisible();
});
