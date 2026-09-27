import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gallerySection, openGallery } from "./helpers";

// Tabs, Segmented and the segmented variant of Tabs: the keyboard contract in the doc comments
// ("arrow keys · Home and End · tablist or radiogroup") in the gallery.

// reka-ui checks a radio from a `setTimeout(0)` and only while the arrow key is still down, and
// Playwright's default press releases it at once, which no keyboard does.
const holdKey = (page: Page, key: string) => page.keyboard.press(key, { delay: 50 });

test.beforeEach(async ({ page, galleryUrl }) => {
  await openGallery(page, galleryUrl);
});

test.describe("Tabs", () => {
  const tablist = (page: Page) => gallerySection(page, "Tabs and Segmented").getByRole("tablist", { name: "Workspace sections" }).first();

  test("is a tablist with the first tab selected and its panel shown; a disabled tab is disabled", async ({ page }) => {
    const tabs = tablist(page);
    await expect(tabs.getByRole("tab")).toHaveCount(4);
    await expect(tabs.getByRole("tab", { name: "Voice" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Voice" })).toHaveText("Panel content for Voice");
    await expect(tabs.getByRole("tab", { name: "Off" })).toBeDisabled();
  });

  test("arrow keys move and select, skip the disabled tab and wrap; Home and End go to the ends", async ({ page }) => {
    const tabs = tablist(page);
    const voice = tabs.getByRole("tab", { name: "Voice" });
    const chat = tabs.getByRole("tab", { name: /^Chat/ });
    const settings = tabs.getByRole("tab", { name: "Settings" });
    await voice.focus();

    await page.keyboard.press("ArrowRight");
    await expect(chat).toBeFocused();
    await expect(chat).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: /^Chat/ })).toHaveText("Panel content for Chat");
    await expect(gallerySection(page, "Tabs and Segmented").getByText("tab = chat")).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(settings).toBeFocused();
    // The next tab is the disabled Off, so the focus wraps to the first.
    await page.keyboard.press("ArrowRight");
    await expect(voice).toBeFocused();
    await expect(voice).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(settings).toBeFocused();

    await page.keyboard.press("Home");
    await expect(voice).toBeFocused();
    await page.keyboard.press("End");
    await expect(settings).toBeFocused();
    await expect(settings).toHaveAttribute("aria-selected", "true");
  });

  test("the list is one tab stop: Tab leaves it, and Shift+Tab comes back to the selected tab", async ({ page }) => {
    const tabs = tablist(page);
    const settings = tabs.getByRole("tab", { name: "Settings" });
    await tabs.getByRole("tab", { name: "Voice" }).focus();
    await page.keyboard.press("End");
    await expect(settings).toBeFocused();

    await page.keyboard.press("Tab");
    expect(await tabs.evaluate((list) => list.contains(document.activeElement))).toBe(false);
    await page.keyboard.press("Shift+Tab");
    await expect(settings).toBeFocused();
  });

  test("the segmented variant is a tablist too and takes the same keys", async ({ page }) => {
    const section = gallerySection(page, "Tabs and Segmented");
    const list = section.getByRole("tablist", { name: "Workspace sections" }).nth(1);
    await list.getByRole("tab", { name: "Members" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(list.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");
    await expect(section.getByText(/view = files/)).toBeVisible();
    await page.keyboard.press("End");
    await expect(list.getByRole("tab", { name: "Log" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(list.getByRole("tab", { name: "Members" })).toBeFocused();
  });
});

test.describe("Segmented", () => {
  const group = (page: Page) => gallerySection(page, "Tabs and Segmented").getByRole("radiogroup", { name: "Settings" }).first();

  test("is a radiogroup with one choice, and Shift+Tab comes back to the chosen segment", async ({ page }) => {
    const choice = group(page);
    await expect(choice.getByRole("radio")).toHaveCount(3);
    await expect(choice.getByRole("radio", { name: "System" })).toBeChecked();

    await choice.getByRole("radio", { name: "System" }).focus();
    await holdKey(page, "ArrowRight");
    await expect(choice.getByRole("radio", { name: "Light" })).toBeChecked();
    await page.keyboard.press("Tab");
    expect(await choice.evaluate((list) => list.contains(document.activeElement))).toBe(false);
    await page.keyboard.press("Shift+Tab");
    await expect(choice.getByRole("radio", { name: "Light" })).toBeFocused();
  });

  test("arrow keys move the choice and wrap, and the bound value follows", async ({ page }) => {
    const section = gallerySection(page, "Tabs and Segmented");
    const choice = group(page);
    await choice.getByRole("radio", { name: "System" }).focus();

    await holdKey(page, "ArrowRight");
    await expect(choice.getByRole("radio", { name: "Light" })).toBeChecked();
    await expect(choice.getByRole("radio", { name: "Light" })).toBeFocused();
    await expect(section.getByText(/theme = light/)).toBeVisible();
    await holdKey(page, "ArrowRight");
    await expect(choice.getByRole("radio", { name: "Dark" })).toBeChecked();
    await holdKey(page, "ArrowRight");
    await expect(choice.getByRole("radio", { name: "System" })).toBeChecked();
    await holdKey(page, "ArrowLeft");
    await expect(choice.getByRole("radio", { name: "Dark" })).toBeChecked();
    await expect(section.getByText(/theme = dark/)).toBeVisible();
  });

  test("two controls on one value stay in step", async ({ page }) => {
    const section = gallerySection(page, "Tabs and Segmented");
    await section.getByRole("radiogroup", { name: "Settings" }).last().getByRole("radio", { name: "Dark" }).click();
    await expect(section.getByRole("radiogroup", { name: "Settings" }).first().getByRole("radio", { name: "Dark" })).toBeChecked();
  });
});
