import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { useCannedApi } from "../fixtures/canned-api";
import { installVoiceFixture } from "../fixtures/scripted-gateway";
import { expectInRoom, memberRow, openMemberMenu, openSettings, submitJoin } from "../helpers";
import { describeFocus, tabRound } from "./keys";

// Keyboard use of the guest page and the room: the Tab order, the ring on every stop, dialogs that
// keep the focus and give it back, and menus that Esc closes. The libraries' own components have
// their keyboard specs in layer 4 (`gallery.*.spec.ts`); these are the product's screens.

async function joinRoom(page: Page) {
  await useCannedApi(page, { lang: "en", theme: "light" });
  await installVoiceFixture(page.context());
  await submitJoin(page, "Snapshot Tester");
  await expectInRoom(page, "Snapshot Tester");
}

async function guestPage(page: Page) {
  await useCannedApi(page, { lang: "en", theme: "light" });
  await page.goto("/", { waitUntil: "networkidle" });
}

const screens = {
  join: { open: guestPage, minStops: 10 },
  room: { open: joinRoom, minStops: 10 },
};

for (const [name, screen] of Object.entries(screens)) {
  test.describe(name, () => {
    test("Tab visits many controls and comes round again, so nothing traps the focus", async ({ page }, { project }) => {
      await screen.open(page);
      const { stops, closed } = await tabRound(page);
      expect(closed, `no round after ${stops.length} stops`).toBe(true);
      // A desktop room adds the dock, the header and the chat: the smoke run measured 26 stops.
      const floor = name === "room" && project.name === "desktop" ? 20 : screen.minStops;
      expect(stops.length, stops.map((stop) => stop.label).join(" | ")).toBeGreaterThanOrEqual(floor);
    });

    test("every Tab press but the wrap lands on a control", async ({ page }) => {
      await screen.open(page);
      const { gaps } = await tabRound(page);
      expect(gaps).toBeLessThanOrEqual(1);
    });

    test("every stop shows a focus ring", async ({ page }) => {
      test.fail(name === "join", "F46: Clear local data has no ring");
      await screen.open(page);
      const { stops } = await tabRound(page);
      const bare = stops.filter((stop) => stop.ring === "none").map((stop) => `${stop.tag} "${stop.label}"`);
      expect(bare, "stops with no ring").toEqual([]);
    });

    test("F46 pinned: the stops with no ring", async ({ page }) => {
      await screen.open(page);
      const { stops } = await tabRound(page);
      const bare = stops.filter((stop) => stop.ring === "none").map((stop) => `${stop.tag} "${stop.label}"`);
      expect(bare).toEqual(name === "join" ? ['button "Clear local data"'] : []);
    });
  });
}

// Presses Tab and Shift+Tab well past the number of controls in the dialog: the focus must stay
// inside it, on a control that shows a ring.
async function expectFocusTrapped(page: Page) {
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let press = 0; press < 14; press++) {
      await page.keyboard.press(key);
      const stop = await describeFocus(page);
      expect(stop?.inDialog, `${key} ${press + 1} left the dialog for ${stop?.label ?? "the document"}`).toBe(true);
      expect(stop?.ring, `no ring on ${stop?.label}`).not.toBe("none");
    }
  }
}

test.describe("dialogs", () => {
  test("the QQ dialog keeps the focus, and Esc gives it back to its button", async ({ page }) => {
    await guestPage(page);
    const opener = page.getByRole("button", { name: "QQ group" });
    await opener.click();
    await expect(page.getByRole("dialog", { name: "QQ group" })).toBeVisible();
    await expectFocusTrapped(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("the server password dialog keeps the focus", async ({ page }) => {
    await useCannedApi(page, { lang: "en", theme: "light" });
    await installVoiceFixture(page.context(), { firstConnectionFails: "PASSWORD_REQUIRED" });
    await submitJoin(page, "Snapshot Tester");
    await expect(page.getByRole("dialog", { name: "Server password required" })).toBeVisible();
    await expectFocusTrapped(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("the channel password dialog keeps the focus, and Esc leaves the person in the room", async ({ page }) => {
    await useCannedApi(page, { lang: "en", theme: "light" });
    await installVoiceFixture(page.context(), { channelPasswords: { "3": "right" } });
    await submitJoin(page, "Snapshot Tester");
    await expectInRoom(page, "Snapshot Tester");
    await page.getByRole("button", { name: /^Strategy/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectFocusTrapped(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await describeFocus(page), "the focus is lost when the dialog closes").not.toBeNull();
  });

  test("the audio settings dialog keeps the focus, and Esc gives it back to its button", async ({ page }) => {
    await joinRoom(page);
    const { opener } = await openSettings(page);
    await expectFocusTrapped(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

test.describe("menus", () => {
  test("Esc closes the member menu and the focus is not lost", async ({ page }, { project }) => {
    test.fail(project.name === "desktop", "F47: the menu returns the focus to a row that cannot take it");
    await joinRoom(page);
    const menu = await openMemberMenu(page, "Alex Rivera");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    expect(await describeFocus(page), "the focus is lost when the menu closes").not.toBeNull();
  });

  test("F47 pinned: the desktop menu opens with Shift+F10 on a row's slider, and Esc leaves the focus on the document", async ({ page }, { project }) => {
    test.skip(project.name !== "desktop", "the phone's menu belongs to a button that takes the focus back");
    await joinRoom(page);
    await memberRow(page, "Alex Rivera").getByRole("slider").focus();
    await page.keyboard.press("Shift+F10");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    expect(await describeFocus(page)).toBeNull();
  });

  test("Esc closes the language menu and gives the focus back to its button", async ({ page }) => {
    await guestPage(page);
    const opener = page.getByRole("button", { name: "Language" });
    await opener.click();
    await expect(page.getByRole("menu").or(page.getByRole("dialog"))).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu").or(page.getByRole("dialog"))).toBeHidden();
    await expect(opener).toBeFocused();
  });
});
