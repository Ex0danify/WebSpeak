import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { overflowScan } from "./helpers";

// The /demo page: simulated data, no gateway session. It is served by the gateway from the fresh
// build like the real pages. It reads its own language (see F32), so most tests store English first.

test.describe("demo page", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Only a first visit: a test that switches language must still see its choice after a reload.
      if (!localStorage.getItem("webspeak:language")) localStorage.setItem("webspeak:language", "en");
    });
  });

  const voiceCard = (page: Page, name: string) => page.getByRole("article").filter({ hasText: name });

  test("shows the simulated channels, the hero and the two voice cards of the first channel", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("link", { name: "Back home" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quiet Zone");
    await expect(page.getByText("2 online")).toBeVisible();
    await expect(voiceCard(page, "illusia")).toBeVisible();
    await expect(voiceCard(page, "msicbot")).toBeVisible();
    await expect(page.getByText("This page never connects to a real TeamSpeak server.")).toBeVisible();
  });

  test("the speaking toggle turns the speaking state off and on again", async ({ page }) => {
    await page.goto("/demo");
    // The page starts with illusia speaking: the card says so, and so does the avatar in the list.
    await expect(voiceCard(page, "illusia")).toContainText("Speaking…");
    await expect(page.getByRole("img", { name: "Speaking…" })).toBeVisible();

    await page.getByRole("button", { name: "Stop speaking" }).click();
    await expect(voiceCard(page, "illusia")).toContainText("Connected");
    await expect(voiceCard(page, "illusia")).not.toContainText("Speaking…");
    await expect(page.getByRole("img", { name: "Speaking…" })).toHaveCount(0);

    await page.getByRole("button", { name: "Simulate speaking" }).click();
    await expect(voiceCard(page, "illusia")).toContainText("Speaking…");
    await expect(page.getByRole("img", { name: "Speaking…" })).toBeVisible();
  });

  test("clicking a voice card makes that member the speaker", async ({ page }) => {
    await page.goto("/demo");
    await voiceCard(page, "msicbot").click();
    await expect(voiceCard(page, "msicbot")).toContainText("Speaking…");
    await expect(voiceCard(page, "illusia")).not.toContainText("Speaking…");
  });

  test("Poke shows the poke banner, Close dismisses it, and Poke again toggles it", async ({ page }) => {
    await page.goto("/demo");
    const banner = page.getByText("msicbot poked you");
    await expect(banner).toBeHidden();

    await page.getByRole("button", { name: "Poke", exact: true }).click();
    await expect(banner).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(banner).toBeHidden();

    // The button is a toggle: the same click that showed the banner also hides it again.
    await page.getByRole("button", { name: "Poke", exact: true }).click();
    await expect(banner).toBeVisible();
    await page.getByRole("button", { name: "Poke", exact: true }).click({ force: true });
    await expect(banner).toBeHidden();
  });

  test("Simulate reconnect shows the warning and Restore clears it", async ({ page }) => {
    await page.goto("/demo");
    const notice = page.getByText("Connection interrupted, recovering…");
    await expect(notice).toBeHidden();

    await page.getByRole("button", { name: "Simulate reconnect" }).click();
    await expect(notice).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(notice).toBeHidden();
  });

  test("choosing a channel shows its members, and an empty channel shows no voice cards", async ({ page, isMobile }) => {
    test.skip(isMobile, "a phone lists only the selected channel (F33)");
    await page.goto("/demo");
    await page.getByRole("button", { name: /^Lounge 1$/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lounge");
    await expect(page.getByText("1 online")).toBeVisible();
    await expect(voiceCard(page, "Alice")).toBeVisible();
    await expect(voiceCard(page, "illusia")).toHaveCount(0);

    await page.getByRole("button", { name: /^Music room 0$/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Music room");
    await expect(page.getByText("0 online")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  });

  test("F33: a phone lists only the selected channel, so no other channel can be chosen", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the desktop lists every channel");
    await page.goto("/demo");
    await expect(page.getByRole("button", { name: /^Quiet Zone 2$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Lounge 1$/ })).toBeHidden();
    await expect(page.getByRole("button", { name: /^Music room 0$/ })).toBeHidden();
  });

  test("a phone can choose any channel of the demo (bug F33)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the desktop lists every channel");
    test.fail();
    await page.goto("/demo");
    await page.getByRole("button", { name: /^Lounge 1$/ }).click({ timeout: 1500 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lounge");
  });

  test("the Channel and Server tabs switch the chat, and a channel click returns to the channel chat", async ({ page, isMobile }) => {
    await page.goto("/demo");
    const tabs = page.getByRole("radiogroup", { name: "chat" });
    await expect(tabs.getByRole("radio", { name: "Channel" })).toBeChecked();
    await expect(page.getByText("Hello everyone, welcome to WebSpeak.")).toBeVisible();

    await tabs.getByRole("radio", { name: "Server" }).click();
    await expect(tabs.getByRole("radio", { name: "Server" })).toBeChecked();
    await expect(page.getByText("No messages yet")).toBeVisible();
    await expect(page.getByText("Hello everyone, welcome to WebSpeak.")).toBeHidden();

    if (isMobile) return; // no other channel to click on a phone (F33)
    await page.getByRole("button", { name: /^Lounge 1$/ }).click();
    await expect(tabs.getByRole("radio", { name: "Channel" })).toBeChecked();
    await expect(page.getByText("Hello everyone, welcome to WebSpeak.")).toBeVisible();
  });

  test("the composer sends a trimmed message and empties the box", async ({ page }) => {
    await page.goto("/demo");
    const box = page.getByRole("textbox", { name: "Send a message…" });
    const send = page.getByRole("button", { name: "Send", exact: true });
    await expect(send).toBeDisabled();
    await box.fill("   ");
    await expect(send).toBeDisabled();

    await box.fill("  hello demo  ");
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByText("hello demo", { exact: true })).toBeVisible();
    await expect(page.getByText("illusia · now")).toBeVisible();
    await expect(box).toHaveValue("");
    await expect(send).toBeDisabled();

    await box.fill("second");
    await box.press("Enter");
    await expect(page.getByText("second", { exact: true })).toBeVisible();
    await expect(box).toHaveValue("");
  });

  test("the language menu switches the page and is remembered", async ({ page, isMobile }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "Language" }).click();
    // The menu is a bottom sheet of buttons on a phone.
    await page.getByRole(isMobile ? "button" : "menuitem", { name: /Deutsch/ }).click();
    await expect(page.getByRole("button", { name: "Anstupsen", exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("webspeak:language"))).toBe("de");

    await page.reload();
    await expect(page.getByRole("button", { name: "Anstupsen", exact: true })).toBeVisible();
  });

  test("initials keep their size: 10 px in the channel list and 18 px on a voice card (5.21a)", async ({ page }) => {
    await page.goto("/demo");
    const fontSize = (locator: ReturnType<Page["locator"]>) => locator.evaluate((el) => getComputedStyle(el).fontSize);
    // The list's avatars are 20 px (xs) and the cards' are 56 px (xl). The bug was a rule for the
    // card's status text that also matched the avatar and shrank the big initials to 10 px.
    const listInitial = page.locator("aside").first().getByText("M", { exact: true });
    const cardInitial = voiceCard(page, "msicbot").getByText("M", { exact: true });
    expect(await fontSize(listInitial)).toBe("10px");
    expect(await fontSize(cardInitial)).toBe("18px");
    const box = await cardInitial.locator("xpath=ancestor::span[1]").boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(56);
  });

  test("nothing overflows sideways", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quiet Zone");
    expect(await overflowScan(page)).toEqual({ clipped: [], pageScrolls: false });
  });
});

test.describe("demo page language", () => {
  test("F32: an English browser without a stored language gets the demo in Chinese", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("button", { name: "戳一戳" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Poke", exact: true })).toBeHidden();
  });

  test("the demo follows an English browser's language, as the join page does (bug F32)", async ({ page }) => {
    test.fail();
    await page.goto("/demo");
    await expect(page.getByRole("button", { name: "Poke", exact: true })).toBeVisible({ timeout: 1500 });
  });
});
