import type { Page } from "@playwright/test";
import { translations } from "../../web/src/i18n/webclient";
import { expect, test } from "../fixtures";
import { adminScreens, useCannedApi } from "../fixtures/canned-api";
import { installVoiceFixture } from "../fixtures/scripted-gateway";
import { overflowScan } from "../helpers";

// No text is cut off or sits outside the screen at 390 px, and the page never scrolls sideways, in
// all five languages: the join page, the demo, the admin console, and the room on each of the
// phone's four panels. Layer 4 has the same check for German and Russian on the join page and the
// room (`appearance.spec.ts`); this one adds the other pages and languages. What the scan finds today
// is listed below with its finding: the test fails on anything else, and on a row that no longer
// happens.

const known: Record<string, { finding: string; clipped: string[] }> = {};

const languages = ["en", "zh", "de", "ru", "ja"] as const;

const visit = (path: string) => async (page: Page) => {
  await page.goto(path, { waitUntil: "networkidle" });
};

for (const lang of languages) {
  const text = (key: string) => translations[lang]![key]!;

  async function joined(page: Page) {
    await installVoiceFixture(page.context());
    await page.goto("/");
    await page.getByLabel(text("nickname")).fill("Snapshot Tester");
    await page.getByRole("button", { name: text("enterVoice") }).click();
    await expect(page.getByRole("textbox", { name: text("searchMembers") })).toBeVisible();
  }

  const room = (tab: string) => async (page: Page) => {
    await joined(page);
    await page.getByRole("tab", { name: text(tab) }).click();
    await expect(page.getByRole("tab", { name: text(tab), selected: true })).toBeVisible();
  };

  const states: Record<string, (page: Page) => Promise<void>> = {
    join: visit("/"),
    demo: visit("/demo"),
    "admin-login": visit("/admin/login"),
    ...Object.fromEntries(adminScreens.map((screen) => [screen.id, visit(screen.path)])),
    "room-channels": room("mobileChannels"),
    "room-chat": room("mobileChat"),
    "room-voice": room("mobileVoice"),
    "room-more": room("mobileMore"),
  };

  test(`${lang}: nothing is cut off or off screen`, async ({ page }, { project }) => {
    test.skip(project.name !== "mobile", "the phone viewport is where text runs out of room");
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const [state, open] of Object.entries(states)) {
      await useCannedApi(page, { lang, theme: "light", admin: adminScreens.some((screen) => screen.id === state) });
      await open(page);
      const { clipped, pageScrolls } = await overflowScan(page);
      const key = `${lang} ${state}`;
      const row = known[key];
      if (row) seen.add(key);
      if (pageScrolls) problems.push(`${key}: the page scrolls sideways`);
      const expected = row?.clipped ?? [];
      if (JSON.stringify(clipped) !== JSON.stringify(expected)) problems.push(`${key}: found ${JSON.stringify(clipped)}, listed ${JSON.stringify(expected)}`);
    }
    for (const key of Object.keys(known)) if (key.startsWith(`${lang} `) && !seen.has(key)) problems.push(`${key}: listed but not visited`);
    expect(problems).toEqual([]);
  });
}
