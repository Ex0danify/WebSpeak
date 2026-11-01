import { expect, type Locator, type Page } from "@playwright/test";

/** The audio settings dialog. */
export const settingsDialog = (page: Page): Locator => page.getByRole("dialog", { name: "Audio configuration" });

/**
 * The button that opens the audio settings: on desktop the one in the dock's options popover (the
 * popover is opened here), on a phone the More tab's (the tab is opened here). The dock's own buttons
 * are found by their names in the spec that needs them.
 */
export async function settingsOpener(page: Page): Promise<Locator> {
  const more = page.getByRole("tab", { name: "More" });
  if (await more.isVisible()) {
    if ((await more.getAttribute("aria-selected")) !== "true") await more.click();
    return page.getByRole("button", { name: "Audio settings" });
  }
  await page
    .getByRole("toolbar", { name: "Audio controls" })
    .getByRole("button", { name: /^Audio options/ })
    .click();
  return page.getByRole("dialog", { name: "Audio options" }).getByRole("button", { name: "Audio settings" });
}

/** Opens the dialog and returns it with the control that gets the focus back when it closes (the dock's options button on desktop). */
export async function openSettings(page: Page): Promise<{ dialog: Locator; opener: Locator }> {
  const item = await settingsOpener(page);
  const options = page.getByRole("toolbar", { name: "Audio controls" }).getByRole("button", { name: /^Audio options/ });
  const fromDock = (await options.count()) > 0;
  await item.click();
  const dialog = settingsDialog(page);
  await expect(dialog).toBeVisible();
  return { dialog, opener: fromDock ? options : item };
}
