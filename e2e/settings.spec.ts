import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { focusInfo, join, openSettings, settingsDialog } from "./helpers";

// The audio settings dialog of the connected view. Real gateway, fake TeamSpeak server, Chromium's
// fake microphone. On desktop it opens from the audio dock, on a phone from the "More" tab.

test.describe("audio settings dialog", () => {
  test("has the input and the output section, each with its controls", async ({ page }) => {
    await join(page, "set-panels");
    const { dialog } = await openSettings(page);

    await expect(dialog.getByRole("heading", { name: "Input device" })).toBeVisible();
    await expect(dialog.getByLabel("Microphone", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("slider", { name: "Voice activation threshold" })).toBeVisible();
    await expect(dialog.getByText("Mic level")).toBeVisible();
    await expect(dialog.getByText("Microphone test")).toBeVisible();

    await expect(dialog.getByRole("heading", { name: "Output volume" })).toBeVisible();
    await expect(dialog.getByLabel("Output device")).toBeVisible();
    await expect(dialog.getByRole("slider", { name: "Notification volume" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  });

  test("the microphone list holds the browser's default and what the browser offers", async ({ page }) => {
    await join(page, "set-devices");
    const { dialog } = await openSettings(page);
    const options = dialog.getByLabel("Microphone", { exact: true }).locator("option");
    await expect(options.first()).toHaveText("Default browser microphone");
    // Chromium's fake device is offered as well.
    await expect.poll(() => options.count()).toBeGreaterThan(1);
  });

  let closeIndex = 0;
  for (const [how, close] of [
    ["Esc", async (page: Page) => page.keyboard.press("Escape")],
    ["Done", async (page: Page) => settingsDialog(page).getByRole("button", { name: "Done" }).click()],
    ["the X button", async (page: Page) => settingsDialog(page).getByRole("button", { name: "Close" }).click()],
    ["a click on the backdrop", async (page: Page) => page.mouse.click(4, 4)],
  ] as const) {
    const nickname = `set-close-${++closeIndex}`;
    test(`${how} closes it and gives focus back to the button that opened it`, async ({ page }) => {
      await join(page, nickname);
      const { dialog, opener } = await openSettings(page);
      await close(page);
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
    });
  }

  test("keeps Tab and Shift+Tab inside while it is open", async ({ page }) => {
    await join(page, "set-trap");
    await openSettings(page);
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let press = 0; press < 25; press++) {
        await page.keyboard.press(key);
        const focus = await focusInfo(page);
        expect(focus === "body" ? "body" : focus.inDialog, `${key} press ${press + 1}`).toBe(true);
      }
    }
  });

  test("the threshold and notification volume take the keyboard, and are still set after a reload", async ({ page }) => {
    await join(page, "set-persist");
    const { dialog } = await openSettings(page);
    const threshold = dialog.getByRole("slider", { name: "Voice activation threshold" });
    const notifications = dialog.getByRole("slider", { name: "Notification volume" });
    const thresholdBefore = Number(await threshold.getAttribute("aria-valuenow"));

    await threshold.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(threshold).toHaveAttribute("aria-valuenow", String(thresholdBefore + 2));
    await notifications.focus();
    await page.keyboard.press("End");
    await expect(notifications).toHaveAttribute("aria-valuenow", "100");
    await expect(notifications).toHaveAttribute("aria-valuetext", "100%");
    const thresholdText = await threshold.getAttribute("aria-valuetext");

    await page.reload();
    await join(page, "set-persist");
    const again = (await openSettings(page)).dialog;
    await expect(again.getByRole("slider", { name: "Notification volume" })).toHaveAttribute("aria-valuenow", "100");
    await expect(again.getByRole("slider", { name: "Voice activation threshold" })).toHaveAttribute("aria-valuetext", thresholdText!);
  });
});
