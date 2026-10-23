import { expect, type Locator, type Page } from "@playwright/test";

/** The server dropdown of the join form, a list select whose trigger is named "Server". */
export const serverPicker = (page: Page): Locator => page.getByRole("combobox", { name: "Server", exact: true });

/** Opens the dropdown, reads the names of its rows in order and closes it again. */
export async function serverOptions(page: Page): Promise<string[]> {
  await serverPicker(page).click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const names = (await options.allTextContents()).map((text) => text.trim());
  await page.keyboard.press("Escape");
  await expect(options.first()).toBeHidden();
  return names;
}

/** Picks a row of the dropdown by its name. */
export async function pickServer(page: Page, name: string): Promise<void> {
  await serverPicker(page).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(serverPicker(page)).toContainText(name);
}
