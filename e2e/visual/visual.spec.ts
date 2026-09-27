import { expect, test } from "../fixtures";
import { connectedScenarios, installVoiceFixture, type ScriptedScenario } from "../fixtures/scripted-gateway";
import { expectInRoom, submitJoin } from "../helpers";
import { adminScreens, type Screen, useCannedApi } from "../fixtures/canned-api";

// Every shot has the name `<screen>-<language>-<theme>-<desktop|mobile>` (the room shots
// `room-<state>-en-<theme>-<size>`), the same 62 names the old snapshot tool wrote.

const themes = ["light", "dark"] as const;

const screens: Screen[] = [
  { id: "join", path: "/", langs: ["en", "zh", "de"] },
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

const localeOf = (lang: string) => (lang === "zh" ? "zh-CN" : lang);

for (const theme of themes) {
  for (const screen of screens) {
    for (const lang of screen.langs) {
      test.describe(`${screen.id} ${lang} ${theme}`, () => {
        test.use({ locale: localeOf(lang), colorScheme: theme });
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
    const rooms: { state: string; scenario: ScriptedScenario; tab?: string; phoneOnly?: boolean }[] = [
      ...connectedScenarios.map((scenario) => ({ state: scenario, scenario, tab: "Voice" })),
      { state: "channels", scenario: "connected", phoneOnly: true },
      { state: "chat", scenario: "connected", tab: "Chat", phoneOnly: true },
      { state: "more", scenario: "connected", tab: "More", phoneOnly: true },
    ];
    for (const { state, scenario, tab, phoneOnly } of rooms) {
      test(`${state} looks the same`, async ({ page }, { project }) => {
        test.skip(phoneOnly === true && project.name !== "mobile", "the phone's tabs are one panel at a time");
        await useCannedApi(page, { lang: "en", theme });
        const scripted = await installVoiceFixture(page.context());
        try {
          await submitJoin(page, "Snapshot Tester");
          await expectInRoom(page, "Snapshot Tester");
          scripted.apply(scenario);
          if (tab && project.name === "mobile") await page.getByRole("tab", { name: tab }).click();
          const text = scenarioText[scenario];
          if (text) await expect(page.getByText(text).first()).toBeVisible();
          await expect(page).toHaveScreenshot(`room-${state}-en-${theme}-${project.name}.png`);
        } finally {
          scripted.stop();
        }
      });
    }
  });
}
