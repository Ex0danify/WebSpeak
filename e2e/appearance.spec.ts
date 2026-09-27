import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { join, overflowScan } from "./helpers";
import { translations } from "../web/src/i18n/webclient";

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

  // With the setting on System the button's label is worked out once, from the operating system as
  // it was then (bug F26).
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

  test("F26: after the operating system goes dark the button still says it switches to dark, and switches to light", async ({ page }) => {
    await systemThenOsGoesDark(page, "theme-stale-pin");
    await expect(themeButton(page)).toHaveAccessibleName("Switch to dark theme");
    await themeButton(page).click();
    expect(await dataTheme(page)).toBe("light");
  });

  test("the button follows the operating system while the setting is System (bug F26)", async ({ page }) => {
    test.fail();
    await systemThenOsGoesDark(page, "theme-stale-mark");
    await expect(themeButton(page)).toHaveAccessibleName("Switch to light theme", { timeout: 1500 });
  });
});

const LANGUAGES = [
  { code: "zh", option: "中文" },
  { code: "en", option: "English" },
  { code: "de", option: "Deutsch" },
  { code: "ru", option: "Русский" },
  { code: "ja", option: "日本語" },
] as const;

const text = (code: string, key: string): string => translations[code][key];

/** Picks a language in the switcher of the join form, whichever language the page is in now. */
async function pickLanguage(page: Page, from: string, option: string): Promise<void> {
  await page.getByRole("button", { name: text(from, "languageMenu"), exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp(option) }).or(page.getByRole("dialog").getByRole("button", { name: new RegExp(option) })).click();
}

test.describe("language", () => {
  test("each of the five languages switches the page at once, and the switcher shows the current one", async ({ page }) => {
    await page.goto("/");
    let current = "en";
    await expect(page.getByRole("button", { name: text("en", "enterVoice") })).toBeVisible();
    for (const { code, option } of [...LANGUAGES, LANGUAGES[1]]) {
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

  // index.html says lang="zh-CN" and nothing changes it when the language does (bug F27).
  test("F27: the page keeps lang zh-CN whatever language it is shown in", async ({ page }) => {
    await page.goto("/");
    await pickLanguage(page, "en", "Deutsch");
    await expect(page.getByRole("button", { name: text("de", "enterVoice") })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("zh-CN");
  });

  test("the html lang attribute follows the language of the page (bug F27)", async ({ page }) => {
    test.fail();
    await page.goto("/");
    await pickLanguage(page, "en", "Deutsch");
    await expect(page.getByRole("button", { name: text("de", "enterVoice") })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang), { timeout: 1500 }).toBe("de");
  });
});

// German and Russian have the longest words. Nothing may be cut off or sit outside the screen, on the
// join form and in the room, and on a phone on each of its four tabs.
for (const { code, name } of [
  { code: "de", name: "German" },
  { code: "ru", name: "Russian" },
]) {
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
