import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { installVoiceFixture } from "./fixtures/scripted-gateway";
import { discoveredLanguages, loadFolder } from "./helpers/translations";
import { TEST_ADMIN_PASSWORD } from "../test/helpers/gateway";

// I6.2: every discovered language (a loop over the list, so a later language is covered with no edit)
// shows the finished states in its own words. Expected text comes from the language files, so the
// spec never hard-codes a translation; what it asserts besides is the absence of defects: a message
// key or `err_CODE` on screen, a CJK character, an unfilled `{{placeholder}}`, a wrong `<html lang>`.
// The chat tabs and the member tree sit on other tabs of the phone layout, so the matrix runs on desktop.

const FOLDERS = {
  common: "shared/i18n/common",
  session: "features/session/i18n",
  chat: "features/room/chat/i18n",
  screenShare: "features/screenShare/i18n",
  join: "features/join/i18n",
  room: "features/room/i18n",
} as const;

const catalogs = Object.fromEntries(await Promise.all(Object.entries(FOLDERS).map(async ([name, folder]) => [name, await loadFolder(folder)] as const)));
const tagOf = async (code: string): Promise<string> => ((await import(`../web/src/shared/i18n/common/${code}.ts`)) as { meta: { tag: string } }).meta.tag;

const CJK = new RegExp("[\\u2e80-\\u9fff\\uac00-\\ud7af\\uf900-\\ufaff\\uff00-\\uffef\\u3040-\\u30ff]");

function fill(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => params[name] ?? "");
}

/** The visible page must hold no key name, no CJK, no placeholder. */
async function expectCleanPage(page: Page, tag: string): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", tag);
  const text = await page.locator("body").innerText();
  expect(text, "a raw err_ key").not.toMatch(/\berr_[A-Z_]+\b/);
  expect(text, "an unfilled placeholder").not.toContain("{{");
  expect(text, "CJK text").not.toMatch(CJK);
  const keys = new Set(Object.values(catalogs).flatMap((byLanguage) => Object.keys(byLanguage.en ?? {})));
  const stray = text.split(/\s+/).filter((word) => /^[a-z][A-Za-z0-9]*_?[A-Za-z0-9]*$/.test(word) && /[a-z][A-Z]/.test(word) && keys.has(word));
  expect(stray, "a message key shown as text").toEqual([]);
}

for (const language of discoveredLanguages()) {
  test.describe(`language matrix: ${language}`, () => {
    test.use({ language });
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name === "mobile", "the chat tabs live on another phone tab");
    });

    const msg = (module: keyof typeof FOLDERS, key: string, params?: Record<string, string>): string => {
      const value = catalogs[module]![language]![key];
      if (value === undefined) throw new Error(`${module}/${language} has no key ${key}`);
      return fill(value, params);
    };

    // The shared join helpers locate by the English labels, so the matrix reads the labels of its language.
    const join = async (page: Page, nickname: string): Promise<void> => {
      await page.goto("/");
      await page.getByLabel(msg("join", "nickname")).fill(nickname);
      await page.getByRole("button", { name: msg("join", "enterVoice") }).click();
    };

    test("join page and a refused connection", async ({ page }) => {
      const tag = await tagOf(language);

      // join page + a refused connection (the scripted gateway answers the first socket with a failure)
      await installVoiceFixture(page.context(), { firstConnectionFails: "SERVER_FULL" });
      await join(page, "Matrix Tester");
      await expect(page.getByText(msg("session", "err_SERVER_FULL"))).toBeVisible();
      await expectCleanPage(page, tag);
    });

    test("in the room: the screen-share error and a server event follow the language", async ({ page }) => {
      const tag = await tagOf(language);
      const scripted = await installVoiceFixture(page.context());
      await join(page, "Matrix Tester");
      await expect(page.getByRole("textbox", { name: msg("room", "searchMembers") })).toBeVisible();

      scripted.send({ type: "screenShareError", code: "SCREEN_SHARE_ALREADY_ACTIVE" });
      await expect(page.getByText(msg("screenShare", "err_SCREEN_SHARE_ALREADY_ACTIVE")).first()).toBeVisible();

      scripted.send({ type: "serverEvent", event: { id: "matrix-1", kind: "joined", nickname: "Zed", message: "Zed joined the server", timestamp: Date.UTC(2026, 0, 15, 20, 15) } });
      await page.getByRole("tab", { name: msg("chat", "eventLog"), exact: true }).click();
      await expect(page.getByText(msg("chat", "eventMemberJoined", { nickname: "Zed" }))).toBeVisible();

      await expectCleanPage(page, tag);
    });

    test("the admin console signs in", async ({ page, ownGateway }) => {
      const tag = await tagOf(language);
      const gateway = await ownGateway();
      await page.goto(`${gateway.url}/admin`);
      await expectCleanPage(page, tag);
      await page.locator("input[type=password]").fill(TEST_ADMIN_PASSWORD);
      await page.locator("form button[type=submit]").click();
      await expect(page.locator("h1")).toBeVisible();
      await expect(page).toHaveURL(/\/admin\/?$/);
      await expectCleanPage(page, tag);
    });
  });
}
