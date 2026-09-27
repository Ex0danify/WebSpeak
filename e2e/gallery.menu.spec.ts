import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gallerySection, openGallery } from "./helpers";

// Menu in the gallery: a popup on desktop (reka-ui's dropdown menu) and, at 740 px and below, a bottom
// sheet of buttons in a dialog. Both are opened from the first "Member actions" trigger.

test.beforeEach(async ({ page, galleryUrl }) => {
  await openGallery(page, galleryUrl);
});

const trigger = (page: Page) => gallerySection(page, "Menu").getByRole("button", { name: "Member actions" });
// Not scoped to the section: while a dialog is open, the page behind it is hidden from the roles.
const picked = (page: Page) => page.getByText(/^Last action:/);

/** Opens the menu with the keyboard, the way the doc comment promises, and returns the popup or the sheet. */
async function openMenu(page: Page): Promise<Locator> {
  await trigger(page).focus();
  await page.keyboard.press("Enter");
  // The popup is named by its trigger, not by its label (F34); the sheet is a dialog with the label.
  const menu = page.getByRole("menu").or(page.getByRole("dialog", { name: "Actions for Kestrel" }));
  await expect(menu).toBeVisible();
  return menu;
}

test.describe("popup (desktop)", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "a phone shows the sheet instead");
  });

  test("Enter opens it with the trigger marked expanded and focus on the first item", async ({ page }) => {
    await expect(trigger(page)).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
    const menu = await openMenu(page);
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("menuitem", { name: /^Volume/ })).toBeFocused();
  });

  test("arrow keys walk the items, skip the disabled one and stop at the ends; Home and End jump", async ({ page }) => {
    const menu = await openMenu(page);
    const item = (name: RegExp) => menu.getByRole("menuitem", { name });
    for (const name of [/^Move to my channel/, /^Move to channel/, /^Mute for me/, /^View profile/, /^Kick from channel/]) {
      await page.keyboard.press("ArrowDown");
      await expect(item(name)).toBeFocused();
    }
    // The last item is the end: no wrap.
    await page.keyboard.press("ArrowDown");
    await expect(item(/^Kick from channel/)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(item(/^View profile/)).toBeFocused();
    // Home and End on the volume row set its value instead, so they are tried from other items.
    await page.keyboard.press("End");
    await expect(item(/^Kick from channel/)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(item(/^Volume/)).toBeFocused();
    await expect(item(/^Send poke/)).toHaveAttribute("aria-disabled", "true");
  });

  test("typing letters jumps to the item that starts with them, and never to the disabled one", async ({ page }) => {
    // The typed letters add up for a second, so each try opens the menu afresh.
    let menu = await openMenu(page);
    await page.keyboard.type("k");
    await expect(menu.getByRole("menuitem", { name: /^Kick from channel/ })).toBeFocused();
    await page.keyboard.press("Escape");

    menu = await openMenu(page);
    await page.keyboard.type("mu");
    await expect(menu.getByRole("menuitem", { name: /^Mute for me/ })).toBeFocused();
    await page.keyboard.press("Escape");

    menu = await openMenu(page);
    await page.keyboard.type("send");
    await expect(menu.getByRole("menuitem", { name: /^Volume/ })).toBeFocused();
  });

  test("Enter and Space select an item, close the menu and give the focus back to the trigger", async ({ page }) => {
    let menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: /^View profile/ }).focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(trigger(page)).toBeFocused();
    await expect(picked(page)).toHaveText("Last action: profile");

    menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: /^Mute for me/ }).focus();
    await page.keyboard.press("Space");
    await expect(menu).toBeHidden();
    await expect(picked(page)).toHaveText("Last action: mute");
  });

  test("F34: the popup is named by its trigger, not by its label", async ({ page }) => {
    await openMenu(page);
    await expect(page.getByRole("menu")).toHaveAccessibleName("Member actions");
    await expect(page.getByRole("menu")).toHaveAttribute("aria-label", "Actions for Kestrel");
  });

  test("the popup is named by its label, as the Menu doc comment says (bug F34)", async ({ page }) => {
    test.fail();
    await openMenu(page);
    await expect(page.getByRole("menu")).toHaveAccessibleName("Actions for Kestrel", { timeout: 1500 });
  });

  test("Esc closes it and the focus returns to the trigger without choosing anything", async ({ page }) => {
    const menu = await openMenu(page);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger(page)).toBeFocused();
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
    await expect(picked(page)).toHaveText("Last action: none");
  });

  test("a click outside closes it, and a disabled item does nothing", async ({ page }) => {
    const menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: /^Send poke/ }).click({ force: true });
    await expect(menu).toBeVisible();
    await expect(picked(page)).toHaveText("Last action: none");
    await page.getByRole("heading", { level: 1, name: "UI gallery" }).click();
    await expect(menu).toBeHidden();
  });

  test("the submenu opens with Right, closes with Left, and a choice in it closes everything", async ({ page }) => {
    const menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: /^Move to channel/ }).focus();
    await page.keyboard.press("ArrowRight");
    const sub = page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: "Lobby" }) });
    await expect(sub.getByRole("menuitem")).toHaveText(["Lobby", "Raid Night", "AFK"]);
    await expect(sub.getByRole("menuitem", { name: "Lobby" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(sub.getByRole("menuitem", { name: "Raid Night" })).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(sub).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /^Move to channel/ })).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(picked(page)).toHaveText("Last action: Raid Night");
    await expect(menu).toBeHidden();
    await expect(trigger(page)).toBeFocused();
  });

  test("the volume row is an item: Left and Right change it by 5, Home and End jump", async ({ page }) => {
    const menu = await openMenu(page);
    const volume = menu.getByRole("menuitem", { name: /^Volume/ });
    await expect(volume).toHaveAccessibleName("Volume: 100%");
    await page.keyboard.press("ArrowRight");
    await expect(volume).toHaveAccessibleName("Volume: 105%");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(volume).toHaveAccessibleName("Volume: 95%");
    await page.keyboard.press("End");
    await expect(volume).toHaveAccessibleName("Volume: 400%");
    await page.keyboard.press("Home");
    await expect(volume).toHaveAccessibleName("Volume: 0%");
    // It stays open while the value changes.
    await expect(menu).toBeVisible();
  });

  test("inside a dialog, Esc closes the menu first and the dialog next", async ({ page }) => {
    await gallerySection(page, "Menu").getByRole("button", { name: "Menu inside a dialog" }).click();
    const dialog = page.getByRole("dialog", { name: "Menu inside a dialog" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Member actions" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(gallerySection(page, "Menu").getByRole("button", { name: "Menu inside a dialog" })).toBeFocused();
  });

  test("inside a dialog, a choice is made and the dialog stays", async ({ page }) => {
    await gallerySection(page, "Menu").getByRole("button", { name: "Menu inside a dialog" }).click();
    const dialog = page.getByRole("dialog", { name: "Menu inside a dialog" });
    await dialog.getByRole("button", { name: "Member actions" }).click();
    await page.getByRole("menuitem", { name: /^Move to my channel/ }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(picked(page)).toHaveText("Last action: move-here");
  });
});

test.describe("sheet (phone)", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "the desktop shows the popup");
  });

  test("the trigger opens a dialog of buttons with a Close button, and Close returns the focus", async ({ page }) => {
    await expect(trigger(page)).toHaveAttribute("aria-haspopup", "menu");
    const sheet = await openMenu(page);
    // The sheet is modal, so the trigger behind it is hidden from the roles.
    const hiddenTrigger = page.getByRole("button", { name: "Member actions", includeHidden: true }).first();
    await expect(hiddenTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(sheet.getByRole("button", { name: "Move to my channel" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Send poke (no permission)" })).toBeDisabled();
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(trigger(page)).toBeFocused();
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("Esc and a tap on the backdrop close it without choosing anything", async ({ page }) => {
    let sheet = await openMenu(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    sheet = await openMenu(page);
    await page.mouse.click(195, 40);
    await expect(sheet).toBeHidden();
    await expect(picked(page)).toHaveText("Last action: none");
  });

  test("a tap on an item chooses it and closes the sheet", async ({ page }) => {
    const sheet = await openMenu(page);
    await sheet.getByRole("button", { name: "View profile" }).click();
    await expect(sheet).toBeHidden();
    await expect(picked(page)).toHaveText("Last action: profile");
  });

  test("a submenu expands in place and a choice in it closes the sheet", async ({ page }) => {
    const sheet = await openMenu(page);
    const more = sheet.getByRole("button", { name: "Move to channel", exact: true });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(sheet.getByRole("button", { name: "Raid Night" })).toBeHidden();
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(sheet.getByRole("button", { name: "Lobby" })).toBeVisible();
    await more.click();
    await expect(sheet.getByRole("button", { name: "Lobby" })).toBeHidden();

    await more.click();
    await sheet.getByRole("button", { name: "Raid Night" }).click();
    await expect(sheet).toBeHidden();
    await expect(picked(page)).toHaveText("Last action: Raid Night");
  });

  test("the volume is a plain slider that keeps the sheet open", async ({ page }) => {
    const sheet = await openMenu(page);
    const volume = sheet.getByRole("slider", { name: "Volume" });
    await volume.focus();
    await page.keyboard.press("ArrowRight");
    await expect(volume).toHaveAttribute("aria-valuenow", "105");
    await page.keyboard.press("End");
    await expect(volume).toHaveAttribute("aria-valuenow", "400");
    await expect(sheet).toBeVisible();
  });

  test("inside a dialog, a choice closes the sheet and leaves the dialog", async ({ page }) => {
    await gallerySection(page, "Menu").getByRole("button", { name: "Menu inside a dialog" }).click();
    const dialog = page.getByRole("dialog", { name: "Menu inside a dialog" });
    await dialog.getByRole("button", { name: "Member actions" }).click();
    const sheet = page.getByRole("dialog", { name: "Actions for Kestrel" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Move to my channel" }).click();
    await expect(sheet).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(picked(page)).toHaveText("Last action: move-here");
  });
});
