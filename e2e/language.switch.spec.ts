import { expect, test } from "./fixtures";
import { installVoiceFixture } from "./fixtures/scripted-gateway";
import { discoveredLanguages, loadFolder } from "./helpers/translations";

// Switching the language inside the room re-renders what is already on screen (a screen-share
// error and a server event, both held as codes/kinds, not as sentences) without a new socket.
// Every discovered non-default language is switched to from `en` and back, so a later language is
// covered with no edit. The member tree and the chat tabs sit on other phone tabs, so desktop only.

const FOLDERS = {
  common: "shared/i18n/common",
  chat: "features/room/chat/i18n",
  screenShare: "features/screenShare/i18n",
  join: "features/join/i18n",
  room: "features/room/i18n",
} as const;

const catalogs = Object.fromEntries(
  await Promise.all(Object.entries(FOLDERS).map(async ([name, folder]) => [name, await loadFolder(folder)] as const)),
);
const endonymOf = async (code: string): Promise<string> =>
  ((await import(`../web/src/shared/i18n/common/${code}.ts`)) as { meta: { endonym: string } }).meta.endonym;

const msg = (module: keyof typeof FOLDERS, language: string, key: string, params: Record<string, string> = {}): string => {
  const value = catalogs[module]![language]![key];
  if (value === undefined) throw new Error(`${module}/${language} has no key ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => params[name] ?? "");
};

for (const language of discoveredLanguages().filter((code) => code !== "en")) {
  test.describe(`live language switch: en <-> ${language}`, () => {
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name === "mobile", "the chat tabs live on another phone tab");
    });

    test("an error and a server event re-render without reconnecting", async ({ page }) => {
      const scripted = await installVoiceFixture(page.context());
      await page.goto("/");
      await page.getByLabel(msg("join", "en", "nickname")).fill("Switch Tester");
      await page.getByRole("button", { name: msg("join", "en", "enterVoice") }).click();
      await expect(page.getByRole("textbox", { name: msg("room", "en", "searchMembers") })).toBeVisible();

      scripted.send({ type: "screenShareError", code: "SCREEN_SHARE_ALREADY_ACTIVE" });
      scripted.send({
        type: "serverEvent",
        event: {
          id: "switch-1",
          kind: "joined",
          nickname: "Zed",
          message: "Zed joined the server",
          timestamp: Date.UTC(2026, 0, 15, 20, 15),
        },
      });
      await page.getByRole("tab", { name: msg("chat", "en", "eventLog"), exact: true }).click();
      await expect(page.getByText(msg("screenShare", "en", "err_SCREEN_SHARE_ALREADY_ACTIVE")).first()).toBeVisible();
      await expect(page.getByText(msg("chat", "en", "eventMemberJoined", { nickname: "Zed" }))).toBeVisible();
      const connections = scripted.connections;

      const pick = async (from: string, to: string): Promise<void> => {
        await page.getByRole("button", { name: msg("common", from, "languageMenu"), exact: true }).click();
        const option = new RegExp(await endonymOf(to));
        await page
          .getByRole("menuitem", { name: option })
          .or(page.getByRole("dialog").getByRole("button", { name: option }))
          .click();
        await expect(page.getByText(msg("chat", to, "eventMemberJoined", { nickname: "Zed" }))).toBeVisible();
        await expect(page.getByText(msg("screenShare", to, "err_SCREEN_SHARE_ALREADY_ACTIVE")).first()).toBeVisible();
      };

      await pick("en", language);
      await expect(page.getByText(msg("chat", "en", "eventMemberJoined", { nickname: "Zed" }))).toHaveCount(0);
      await pick(language, "en");

      expect(scripted.connections, "the switch must not open a new socket").toBe(connections);
      expect(scripted.tickets).toHaveLength(1);
    });
  });
}
