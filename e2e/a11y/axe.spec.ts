import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { adminScreens, useCannedApi } from "../fixtures/canned-api";
import { installVoiceFixture, type ScriptedGatewayOptions, type ScriptedScenario } from "../fixtures/scripted-gateway";
import { expectInRoom, openMemberMenu, openSettings, submitJoin } from "../helpers";
import { knownFor } from "./known-violations";

// An axe scan of each screen and each important state, in light and dark, on a desktop and a phone.
// The guest page, the demo and the admin console use the canned API; the room is the scripted
// gateway's (the states a fake TeamSpeak server cannot produce cheaply are its banners).

interface State {
  id: string;
  /** The panels of a phone's room exist only there; a desktop shows them all at once. */
  phoneOnly?: boolean;
  /** Needs the signed-in console's canned answers, the admin screens get them without saying so. */
  admin?: boolean;
  prepare(page: Page): Promise<void>;
}

const NICKNAME = "Snapshot Tester";

async function joinRoom(page: Page, options?: ScriptedGatewayOptions) {
  const scripted = await installVoiceFixture(page.context(), options);
  await submitJoin(page, NICKNAME);
  return scripted;
}

async function inRoom(page: Page, options?: ScriptedGatewayOptions) {
  const scripted = await joinRoom(page, options);
  await expectInRoom(page, NICKNAME);
  return scripted;
}

const visit = (path: string) => async (page: Page) => {
  await page.goto(path, { waitUntil: "networkidle" });
};

const bannerText: Partial<Record<ScriptedScenario, string>> = {
  poke: "Alex Rivera poked you",
  reconnecting: "Attempt 2",
  "reconnect-failed": "Could not restore the connection",
  "audio-notice": "AUDIO_ENCODER_UNAVAILABLE",
};

const states: State[] = [
  { id: "join", prepare: visit("/") },
  {
    id: "join-about-menu",
    async prepare(page) {
      await page.goto("/");
      await page.getByRole("button", { name: "About" }).click();
      await expect(page.getByRole("menu", { name: "About" }).or(page.getByRole("dialog", { name: "About" }))).toBeVisible();
    },
  },
  {
    id: "server-password-dialog",
    async prepare(page) {
      await joinRoom(page, { firstConnectionFails: "PASSWORD_REQUIRED" });
      await expect(page.getByRole("dialog", { name: "Server password required" })).toBeVisible();
    },
  },
  { id: "demo", prepare: visit("/demo") },
  { id: "admin-login", prepare: visit("/admin/login") },
  ...adminScreens.map((screen) => ({ id: screen.id, prepare: visit(screen.path) })),
  {
    id: "admin-gateway-dialog",
    admin: true,
    async prepare(page) {
      await page.goto("/admin/gateway", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Edit Main server" }).click();
      await expect(page.getByRole("dialog", { name: "Edit server" })).toBeVisible();
    },
  },
  { id: "room", prepare: async (page) => void (await inRoom(page)) },
  {
    id: "room-settings-dialog",
    async prepare(page) {
      await inRoom(page);
      await openSettings(page);
    },
  },
  {
    id: "room-member-menu",
    async prepare(page) {
      await inRoom(page);
      await openMemberMenu(page, "Alex Rivera");
    },
  },
  {
    id: "room-channel-password-dialog",
    async prepare(page) {
      await inRoom(page, { channelPasswords: { "3": "right" } });
      await page.getByRole("button", { name: /^Strategy/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    id: "room-away-dialog",
    async prepare(page) {
      await inRoom(page);
      await page.getByRole("button", { name: "Available" }).click();
      await expect(page.getByRole("dialog", { name: "Set away message" })).toBeVisible();
    },
  },
  ...["Voice", "Chat", "More"].map((tab) => ({
    id: `room-tab-${tab.toLowerCase()}`,
    phoneOnly: true,
    async prepare(page: Page) {
      await inRoom(page);
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tab", { name: tab, selected: true })).toBeVisible();
    },
  })),
  ...(Object.keys(bannerText) as ScriptedScenario[]).map((scenario) => ({
    id: `room-${scenario}`,
    async prepare(page: Page) {
      const scripted = await inRoom(page);
      scripted.apply(scenario);
      const voice = page.getByRole("tab", { name: "Voice" });
      if (await voice.isVisible()) await voice.click();
      await expect(page.getByText(bannerText[scenario]!).first()).toBeVisible();
    },
  })),
];

for (const theme of ["light", "dark"] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme });
    for (const state of states) {
      test(state.id, async ({ page }, { project }) => {
        test.skip(state.phoneOnly === true && project.name !== "mobile", "a desktop shows every panel at once");
        await useCannedApi(page, { lang: "en", theme, admin: state.admin ?? adminScreens.some((screen) => screen.id === state.id) });
        await state.prepare(page);
        const { violations, passes } = await new AxeBuilder({ page }).analyze();
        // The contrast rule has to have looked at text, or "no violation" says nothing.
        expect(passes.map((rule) => rule.id).concat(violations.map((rule) => rule.id)), "the contrast rule did not run").toContain(
          "color-contrast",
        );

        const known = knownFor(state.id, project.name);
        const unexpected = violations
          .filter((violation) => !known.has(violation.id))
          .map(
            (violation) =>
              `${violation.id} (${violation.impact}): ${violation.help} at ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
          );
        expect(unexpected, "violations that are not in known-violations.ts").toEqual([]);

        const seen = new Set(violations.map((violation) => violation.id));
        const gone = [...known.values()].filter((row) => !seen.has(row.rule)).map((row) => `${row.rule} (${row.source})`);
        expect(gone, "rows of known-violations.ts that no longer happen: delete them").toEqual([]);
      });
    }
  });
}
