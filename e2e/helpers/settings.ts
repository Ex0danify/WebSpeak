import { expect, type Locator, type Page } from "@playwright/test";

/** The audio settings dialog. */
export const settingsDialog = (page: Page): Locator => page.getByRole("dialog", { name: "Audio configuration" });

/**
 * The button that opens the audio settings: the dock's on desktop, the More tab's on a phone (the
 * tab is opened here). The dock's own buttons are found by their names in the spec that needs them.
 */
export async function settingsOpener(page: Page): Promise<Locator> {
  const more = page.getByRole("tab", { name: "More" });
  if (await more.isVisible()) {
    if ((await more.getAttribute("aria-selected")) !== "true") await more.click();
    return page.getByRole("button", { name: "Audio settings" });
  }
  return page.getByRole("toolbar", { name: "Audio controls" }).getByRole("button", { name: "Audio settings" });
}

/** Opens the dialog and returns it with the button that opened it. */
export async function openSettings(page: Page): Promise<{ dialog: Locator; opener: Locator }> {
  const opener = await settingsOpener(page);
  await opener.click();
  const dialog = settingsDialog(page);
  await expect(dialog).toBeVisible();
  return { dialog, opener };
}
