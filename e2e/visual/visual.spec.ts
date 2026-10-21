import { expect, test } from "../fixtures";
import { connectedScenarios, installVoiceFixture, type ScriptedScenario } from "../fixtures/scripted-gateway";
import { expectInRoom, submitJoin } from "../helpers";
import { adminScreens, type Screen, useCannedApi } from "../fixtures/canned-api";
import { discoveredLanguages, loadFolder } from "../helpers/translations";

// Every shot has the name `<screen>-<language>-<theme>-<desktop|mobile>` (the room shots
// `room-<state>-en-<theme>-<size>`, plus `room-connected-<language>-<theme>-<size>` for each other language).

const themes = ["light", "dark"] as const;

const screens: Screen[] = [
  { id: "join", path: "/", langs: ["en", "de"] },
  { id: "demo", path: "/demo", langs: ["en"] },
  { id: "admin-login", path: "/admin/login", langs: ["en"] },
  ...adminScreens,
];

// What shows when a scenario has been applied, so the shot is not taken before it.
const scenarioText: Partial<Record<ScriptedScenario, string>> = {
  poke: "Alex Rivera poked you",
  reconnecting: "Attempt 2",
  "reconnect-failed": "Could not restore the connection",
  "audio-notice": "AUDIO_ENCODER_UNAVAILABLE",
};

// The connected room in every language other than the default (the `en` shots are the room table below).
const otherLanguages = discoveredLanguages().filter((code) => code !== "en");
const joinCatalog = await loadFolder("features/join/i18n");
const roomCatalog = await loadFolder("features/room/i18n");

for (const theme of themes) {
  for (const screen of screens) {
    for (const lang of screen.langs) {
      test.describe(`${screen.id} ${lang} ${theme}`, () => {
        test.use({ locale: lang, colorScheme: theme });
        test("looks the same", async ({ page }, { project }) => {
          await useCannedApi(page, { lang, theme, admin: screen.admin });
          await page.goto(screen.path, { waitUntil: "networkidle" });
          await expect(page).toHaveScreenshot(`${screen.id}-${lang}-${theme}-${project.name}.png`);
        });
      });
    }
  }

  test.describe(`room ${theme}`, () => {
    test.use({ colorScheme: theme });
    // One shot per state and viewport, plus the phone's other three tabs (a desktop shows all at once).
    const rooms: { state: string; scenario: ScriptedScenario; tab?: string; phoneOnly?: boolean; desktopOnly?: boolean; openAway?: boolean }[] = [
      ...connectedScenarios.map((scenario) => ({ state: scenario, scenario, tab: "Voice" })),
      { state: "channels", scenario: "connected", phoneOnly: true },
      { state: "chat", scenario: "connected", tab: "Chat", phoneOnly: true },
      { state: "more", scenario: "connected", tab: "More", phoneOnly: true },
      { state: "away-dialog", scenario: "connected", desktopOnly: true, openAway: true },
    ];
    for (const { state, scenario, tab, phoneOnly, desktopOnly, openAway } of rooms) {
      test(`${state} looks the same`, async ({ page }, { project }) => {
        test.skip(phoneOnly === true && project.name !== "mobile", "the phone's tabs are one panel at a time");
        test.skip(desktopOnly === true && project.name !== "desktop", "captured on the desktop layout only");
        await useCannedApi(page, { lang: "en", theme });
        const scripted = await installVoiceFixture(page.context());
        try {
          await submitJoin(page, "Snapshot Tester");
          await expectInRoom(page, "Snapshot Tester");
          // A scenario that stops the microphone while it is still starting leaves a "voice failed" banner, on slow runners only.
          await expect(page.getByText("Connecting voice…")).toHaveCount(0);
          scripted.apply(scenario);
          if (tab && project.name === "mobile") await page.getByRole("tab", { name: tab }).click();
          const text = scenarioText[scenario];
          if (text) await expect(page.getByText(text).first()).toBeVisible();
          if (openAway) {
            await page.getByRole("button", { name: "Available" }).click();
            await expect(page.getByRole("dialog", { name: "Set away message" })).toBeVisible();
          }
          await expect(page).toHaveScreenshot(`room-${state}-en-${theme}-${project.name}.png`);
        } finally {
          scripted.stop();
        }
      });
    }
  });
  for (const lang of otherLanguages) {
    test.describe(`room connected ${lang} ${theme}`, () => {
      test.use({ colorScheme: theme, language: lang });
      test("looks the same", async ({ page }, { project }) => {
        await useCannedApi(page, { lang, theme });
        const scripted = await installVoiceFixture(page.context());
        try {
          await page.goto("/");
          await page.getByLabel(joinCatalog[lang]!.nickname!).fill("Snapshot Tester");
          await page.getByRole("button", { name: joinCatalog[lang]!.enterVoice! }).click();
          await expect(page.getByRole("textbox", { name: roomCatalog[lang]!.searchMembers! })).toBeVisible();
          scripted.apply("connected");
          if (project.name === "mobile") await page.getByRole("tab", { name: roomCatalog[lang]!.mobileVoice! }).click();
          await expect(page).toHaveScreenshot(`room-connected-${lang}-${theme}-${project.name}.png`);
        } finally {
          scripted.stop();
        }
      });
    });
  }
}
