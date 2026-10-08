import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { join, overflowScan } from "./helpers";
import { loadJoinRoomTranslations } from "./helpers/translations";

// The merged common, join and room messages per language (a key lives in exactly one of the three).
const translations = await loadJoinRoomTranslations();

// Theme and language: what the page looks like and says, and what the page remembers. Real gateway,
// fake TeamSpeak server. The theme button is in the room's header on desktop and on the More tab of a
// phone; the language switcher is on the join form.

const themeButton = (page: Page) => page.getByRole("button", { name: /^Switch to (light|dark) theme$/ });

/** Opens the More tab of a phone, where its theme button is; a desktop has it in the header. */
async function showThemeButton(page: Page): Promise<void> {
  const more = page.getByRole("tab", { name: "More" });
  if (await more.isVisible()) await more.click();
  await expect(themeButton(page)).toBeVisible();
}

const dataTheme = (page: Page): Promise<string | undefined> => page.evaluate(() => document.documentElement.dataset.theme);
const pageBackground = (page: Page): Promise<string> => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const storedTheme = (page: Page): Promise<string | null> => page.evaluate(() => localStorage.getItem("webspeak:theme"));

test.describe("theme", () => {
  test("the system setting follows the operating system while the page is open", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await join(page, "theme-system");
    expect(await dataTheme(page)).toBe("system");
    const light = await pageBackground(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => pageBackground(page)).not.toBe(light);
    expect(await dataTheme(page)).toBe("system");
    const dark = await pageBackground(page);

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => pageBackground(page)).toBe(light);
    expect(dark).not.toBe(light);
  });

  test("the theme button names the theme it would switch to, and its choice beats the operating system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await join(page, "theme-explicit");
    await showThemeButton(page);
    await expect(themeButton(page)).toHaveAccessibleName("Switch to dark theme");
    const light = await pageBackground(page);

    await themeButton(page).click();
    await expect(themeButton(page)).toHaveAccessibleName("Switch to light theme");
    expect(await dataTheme(page)).toBe("dark");
    await expect.poll(() => pageBackground(page)).not.toBe(light);
    const dark = await pageBackground(page);

    // The system asks for light and dark in turn; an explicit dark stays dark.
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    expect(await dataTheme(page)).toBe("dark");
    expect(await pageBackground(page)).toBe(dark);

    await themeButton(page).click();
    await expect(themeButton(page)).toHaveAccessibleName("Switch to dark theme");
    expect(await dataTheme(page)).toBe("light");
    await expect.poll(() => pageBackground(page)).toBe(light);
  });

  test("a chosen theme is stored and is already applied when the page loads again", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await join(page, "theme-stored");
    await showThemeButton(page);
    await themeButton(page).click();
    expect(await storedTheme(page)).toBe("dark");

    await page.reload();
    expect(await dataTheme(page)).toBe("dark");
    await expect(page.getByLabel("Your nickname")).toBeVisible();
    await join(page, "theme-stored");
    await showThemeButton(page);
    await expect(themeButton(page)).toHaveAccessibleName("Switch to light theme");
  });

  // With the setting on System the button follows the operating system (F26).
  async function systemThenOsGoesDark(page: Page, nickname: string) {
    await page.emulateMedia({ colorScheme: "light" });
    await join(page, nickname);
    await showThemeButton(page);
    await expect(themeButton(page)).toHaveAccessibleName("Switch to dark theme");
    const light = await pageBackground(page);
    await page.emulateMedia({ colorScheme: "dark" });
    // The page itself has gone dark by now.
    await expect.poll(() => pageBackground(page)).not.toBe(light);
  }

  test("the button follows the operating system while the setting is System, both ways (F26)", async ({ page }) => {
    await systemThenOsGoesDark(page, "theme-follow");
    await expect(themeButton(page)).toHaveAccessibleName("Switch to light theme");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(themeButton(page)).toHaveAccessibleName("Switch to dark theme");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(themeButton(page)).toHaveAccessibleName("Switch to light theme");
  });

  test("a click after the operating system went dark switches to light (F26)", async ({ page }) => {
    await systemThenOsGoesDark(page, "theme-click");
    await expect(themeButton(page)).toHaveAccessibleName("Switch to light theme");
    await themeButton(page).click();
    expect(await dataTheme(page)).toBe("light");
    await expect(themeButton(page)).toHaveAccessibleName("Switch to dark theme");
  });

  test("a chosen theme ignores later changes of the operating system (F26)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await join(page, "theme-chosen");
    await showThemeButton(page);
    await themeButton(page).click();
    expect(await dataTheme(page)).toBe("dark");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect(themeButton(page)).toHaveAccessibleName("Switch to light theme");
  });
});

const LANGUAGES = [
  { code: "en", option: "English" },
  { code: "de", option: "Deutsch" },
] as const;

const text = (code: string, key: string): string => translations[code][key];

/** Picks a language in the switcher of the join form, whichever language the page is in now. */
async function pickLanguage(page: Page, from: string, option: string): Promise<void> {
  await page.getByRole("button", { name: text(from, "languageMenu"), exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp(option) }).or(page.getByRole("dialog").getByRole("button", { name: new RegExp(option) })).click();
}

test.describe("language", () => {
  test("each language switches the page at once, and the switcher shows the current one", async ({ page }) => {
    await page.goto("/");
    let current = "en";
    await expect(page.getByRole("button", { name: text("en", "enterVoice") })).toBeVisible();
    for (const { code, option } of [...LANGUAGES, LANGUAGES[0]]) {
      await pickLanguage(page, current, option);
      current = code;
      await expect(page.getByRole("button", { name: text(code, "enterVoice") })).toBeVisible();
      await expect(page.getByRole("button", { name: text(code, "languageMenu"), exact: true })).toBeVisible();
      await expect(page.getByLabel(text(code, "nickname"))).toBeVisible();
    }
  });

  test("the chosen language is remembered, and the room speaks it too", async ({ page }) => {
    await page.goto("/");
    await pickLanguage(page, "en", "Deutsch");
    await page.reload();
    await expect(page.getByRole("button", { name: text("de", "enterVoice") })).toBeVisible();
    await page.getByLabel(text("de", "nickname")).fill("lang-de-room");
    await page.getByRole("button", { name: text("de", "enterVoice") }).click();
    await expect(page.getByRole("textbox", { name: text("de", "searchMembers") })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("webspeak:language"))).toBe("de");
  });

  test("the html lang attribute follows the language of the page (F27)", async ({ page }) => {
    await page.goto("/");
    await pickLanguage(page, "en", "Deutsch");
    await expect(page.getByRole("button", { name: text("de", "enterVoice") })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("de");
    for (const { code, option } of [LANGUAGES[0]]) {
      await pickLanguage(page, await page.evaluate(() => localStorage.getItem("webspeak:language") ?? "en"), option);
      await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(code);
    }
  });

  test("the html lang attribute is set at startup from the stored language (F27)", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("webspeak:language", "de"));
    await page.goto("/");
    await expect(page.getByRole("button", { name: text("de", "enterVoice") })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("de");
  });
});

// German has the longest words. Nothing may be cut off or sit outside the screen, on the
// join form and in the room, and on a phone on each of its four tabs.
for (const { code, name } of [{ code: "de", name: "German" }]) {
  test(`${name}: no text is cut off or off screen on the join form and in the room`, async ({ page, isMobile }) => {
    await page.addInitScript((language) => localStorage.setItem("webspeak:language", language), code);
    await page.goto("/");
    await expect(page.getByRole("button", { name: text(code, "enterVoice") })).toBeVisible();
    expect(await overflowScan(page), "join form").toEqual({ clipped: [], pageScrolls: false });

    await page.getByLabel(text(code, "nickname")).fill(`ovf-${code}`);
    await page.getByRole("button", { name: text(code, "enterVoice") }).click();
    await expect(page.getByRole("textbox", { name: text(code, "searchMembers") })).toBeVisible();

    if (!isMobile) {
      expect(await overflowScan(page), "room").toEqual({ clipped: [], pageScrolls: false });
      return;
    }
    for (const tab of ["mobileChannels", "mobileChat", "mobileVoice", "mobileMore"]) {
      await page.getByRole("tab", { name: text(code, tab) }).click();
      await expect(page.getByRole("tab", { name: text(code, tab), selected: true })).toBeVisible();
      expect(await overflowScan(page), `tab ${tab}`).toEqual({ clipped: [], pageScrolls: false });
    }
  });
}
