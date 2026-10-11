import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { installVoiceFixture, type ScriptedGatewayOptions } from "./fixtures/scripted-gateway";
import { expectInRoom, submitJoin } from "./helpers";

// The scripted gateway serves states the fake TeamSpeak client cannot produce cheaply. These tests
// show that each one reaches the screen; what the UI does with them is covered by steps 4.4 and 4.7.

async function scriptedJoin(page: Page, options?: ScriptedGatewayOptions) {
  const scripted = await installVoiceFixture(page.context(), options);
  await submitJoin(page, "Snapshot Tester");
  return scripted;
}

// The banners live on the Voice tab of the phone layout; the desktop shows everything at once.
async function joinedRoom(page: Page) {
  const scripted = await scriptedJoin(page);
  await expectInRoom(page, "Snapshot Tester");
  const voiceTab = page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("tab", { name: "Voice" });
  if (await voiceTab.isVisible()) await voiceTab.click();
  return scripted;
}

test.describe("banners", () => {
  test("reconnecting shows the attempt number and clears on reconnected", async ({ page }) => {
    const scripted = await joinedRoom(page);
    scripted.apply("reconnecting");
    await expect(page.getByText("Attempt 2")).toBeVisible();
    scripted.apply("reconnected");
    await expect(page.getByText("Attempt 2")).toBeHidden();
  });

  test("a failed reconnect offers a way to try again", async ({ page }) => {
    const scripted = await joinedRoom(page);
    scripted.apply("reconnect-failed");
    await expect(page.getByText("Could not restore the connection")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reconnect now" })).toBeVisible();
  });

  test("an audio encoder error is reported with its code", async ({ page }) => {
    const scripted = await joinedRoom(page);
    scripted.apply("audio-notice");
    await expect(page.getByText("AUDIO_ENCODER_UNAVAILABLE")).toBeVisible();
  });

  test("two pokes show one banner each", async ({ page }) => {
    const scripted = await joinedRoom(page);
    scripted.apply("pokes");
    await expect(page.getByText("Alex Rivera poked you").first()).toBeVisible();
    await expect(page.getByText("Mira Tanaka poked you").first()).toBeVisible();
  });
});

test("a server that wants a password asks for it and joins with the second ticket", async ({ page }) => {
  const scripted = await scriptedJoin(page, { firstConnectionFails: "PASSWORD_REQUIRED" });
  const dialog = page.getByRole("dialog", { name: "Server password required" });
  await expect(dialog).toBeVisible();
  await dialog.locator("input").fill("hunter2");
  await page.keyboard.press("Enter");
  await expectInRoom(page, "Snapshot Tester");
  expect(scripted.tickets.map((ticket) => ticket.serverPassword)).toEqual(["", "hunter2"]);
  expect(scripted.connections).toBe(2);
});

test("a protected channel asks for its password until it gets the right one", async ({ page }) => {
  const scripted = await scriptedJoin(page, { channelPasswords: { "3": "right" } });
  await expectInRoom(page, "Snapshot Tester");
  await page.getByRole("button", { name: /^Strategy/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("input").fill("wrong");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.locator("input").fill("right");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  expect(scripted.commands.filter((command) => command.type === "switchChannel").map((command) => command.payload.password)).toEqual([undefined, "wrong", "right"]);
});
