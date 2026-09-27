import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gallerySection, openGallery } from "./helpers";

// Dialog, Popover, Tooltip, Toast and Banner in the gallery: the focus, Esc and outside-click
// contracts of their doc comments, which are reka-ui's and the browser's, not happy-dom's.

test.beforeEach(async ({ page, galleryUrl }) => {
  await openGallery(page, galleryUrl);
});

const focusIsIn = (container: Locator): Promise<boolean> => container.evaluate((element) => element.contains(document.activeElement));

test.describe("Dialog", () => {
  const opener = (page: Page, name: string) => gallerySection(page, "Dialog").getByRole("button", { name, exact: true });

  test("opens named by its title and description, with the page behind it hidden from assistive tech", async ({ page }) => {
    await opener(page, "Small").click();
    const dialog = page.getByRole("dialog", { name: "Channel password" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("This channel is protected.");
    await expect(page.getByRole("heading", { level: 1, name: "UI gallery" })).toHaveCount(0);
  });

  test("focus lands on the first control of the body, not on the X button", async ({ page }) => {
    await opener(page, "Small").click();
    await expect(page.getByRole("dialog").getByLabel("Password")).toBeFocused();
    await page.keyboard.press("Escape");

    // With no control in the body, focus goes to the close button.
    await opener(page, "Medium").click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Close" }).first()).toBeFocused();
  });

  test("Tab and Shift+Tab stay inside it", async ({ page }) => {
    await opener(page, "Small").click();
    const dialog = page.getByRole("dialog");
    for (let press = 0; press < 6; press++) {
      await page.keyboard.press("Tab");
      expect(await focusIsIn(dialog)).toBe(true);
    }
    for (let press = 0; press < 6; press++) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusIsIn(dialog)).toBe(true);
    }
  });

  test("Esc, the X button, Cancel and the backdrop each close it and give the focus back to its opener", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "Channel password" });
    const close = async (how: () => Promise<void>) => {
      await opener(page, "Small").click();
      await expect(dialog).toBeVisible();
      await how();
      await expect(dialog).toBeHidden();
      await expect(opener(page, "Small")).toBeFocused();
    };
    await close(() => page.keyboard.press("Escape"));
    await close(() => dialog.getByRole("button", { name: "Close", exact: true }).first().click());
    await close(() => dialog.getByRole("button", { name: "Cancel" }).click());
    await close(() => page.mouse.click(4, 4));
  });

  test("a dialog that is not dismissible ignores Esc, the backdrop and the X, and only its own button closes it", async ({ page }) => {
    await opener(page, "Not dismissible").click();
    const dialog = page.getByRole("dialog", { name: "Not dismissible" });
    await expect(dialog).toBeVisible();
    // The only Close is the footer's.
    await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.mouse.click(4, 4);
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(opener(page, "Not dismissible")).toBeFocused();
  });

  test("long content scrolls inside the dialog, which stays within the window with its footer in reach", async ({ page }) => {
    await opener(page, "Long content").click();
    const dialog = page.getByRole("dialog", { name: "Long content" });
    await expect(dialog).toBeVisible();
    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await expect(dialog.getByRole("button", { name: "Close" }).last()).toBeInViewport({ ratio: 1 });
  });
});

test.describe("Popover", () => {
  const trigger = (page: Page) => gallerySection(page, "Popover").getByRole("button", { name: "Output volume" });
  const panel = (page: Page) => page.getByRole("dialog", { name: "Output volume" });

  test("opens named by its label with focus inside it, and the page behind stays reachable", async ({ page }) => {
    await trigger(page).click();
    await expect(panel(page)).toBeVisible();
    expect(await focusIsIn(panel(page))).toBe(true);
    // Not modal: the page behind is not hidden from assistive tech.
    await expect(page.getByRole("heading", { level: 1, name: "UI gallery" })).toBeVisible();
    await expect(panel(page).getByRole("slider", { name: "Volume" })).toBeVisible();
  });

  test("its slider takes the keyboard, and Esc closes it with the focus back on the trigger", async ({ page }) => {
    await trigger(page).click();
    const volume = panel(page).getByRole("slider", { name: "Volume" });
    await volume.focus();
    await page.keyboard.press("ArrowRight");
    await expect(volume).toHaveAttribute("aria-valuenow", "71");

    await page.keyboard.press("Tab");
    await expect(panel(page).getByRole("button", { name: "Done" })).toBeFocused();
    await volume.focus();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
  });

  test("F35: Tab past the last control of the panel wraps to its first", async ({ page }) => {
    await trigger(page).click();
    await panel(page).getByRole("button", { name: "Done" }).focus();
    await page.keyboard.press("Tab");
    await expect(panel(page).getByRole("slider", { name: "Volume" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(panel(page).getByRole("button", { name: "Done" })).toBeFocused();
  });

  test("Tab can leave the panel, as the Popover doc comment says (bug F35)", async ({ page }) => {
    test.fail();
    await trigger(page).click();
    await panel(page).getByRole("button", { name: "Done" }).focus();
    await page.keyboard.press("Tab");
    await expect.poll(() => focusIsIn(panel(page)), { timeout: 1500 }).toBe(false);
  });

  test("Done and a click outside close it", async ({ page }) => {
    await trigger(page).click();
    await panel(page).getByRole("button", { name: "Done" }).click();
    await expect(panel(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();

    await trigger(page).click();
    await expect(panel(page)).toBeVisible();
    await page.getByRole("heading", { level: 1, name: "UI gallery" }).click();
    await expect(panel(page)).toBeHidden();
  });

  test("inside a dialog, Esc closes the popover first and the dialog next", async ({ page }) => {
    await gallerySection(page, "Popover").getByRole("button", { name: "Popover inside a dialog" }).click();
    const dialog = page.getByRole("dialog", { name: "Popover inside a dialog" });
    await dialog.getByRole("button", { name: "Output volume" }).click();
    await expect(panel(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("Tooltip", () => {
  // The visible bubble carries the text and a `data-side`; a hidden copy carries role="tooltip".
  const bubble = (page: Page, text: string) => page.locator("[data-side]").filter({ hasText: text });
  const mute = (page: Page) => gallerySection(page, "Tooltip").getByRole("button", { name: "Mute microphone" });

  /**
   * Focuses the first tooltip trigger with the Tab key. It is scrolled to the middle of the window
   * first, and the scroll events are let through: a tooltip closes when its trigger scrolls, and the
   * event of a scroll that has just happened would arrive after the tooltip had opened.
   */
  async function tabToMute(page: Page): Promise<void> {
    await mute(page).evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await gallerySection(page, "Popover").getByRole("button", { name: "Popover inside a dialog" }).focus();
    await page.keyboard.press("Tab");
    await expect(mute(page)).toBeFocused();
  }

  test("keyboard focus opens it with the text and the shortcut, without taking the focus, and it describes the trigger", async ({ page }) => {
    await tabToMute(page);
    await expect(bubble(page, "Mute microphone")).toBeVisible();
    await expect(bubble(page, "Mute microphone").locator("kbd")).toHaveText("M");
    await expect(mute(page)).toBeFocused();
    await expect(mute(page)).toHaveAttribute("aria-describedby", /.+/);
    // The button keeps its own name; the tooltip only describes it.
    await expect(mute(page)).toHaveAccessibleName("Mute microphone");
  });

  test("Esc and moving the focus away close it", async ({ page }) => {
    await tabToMute(page);
    await expect(bubble(page, "Mute microphone")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bubble(page, "Mute microphone")).toHaveCount(0);

    await tabToMute(page);
    await expect(bubble(page, "Mute microphone")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(bubble(page, "Mute microphone")).toHaveCount(0);
  });

  test("hovering opens it and leaving closes it", async ({ page, isMobile }) => {
    test.skip(isMobile, "a touch screen never hovers");
    const settings = gallerySection(page, "Tooltip").getByRole("button", { name: "Audio settings" });
    await settings.hover();
    await expect(bubble(page, "Audio settings")).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(bubble(page, "Audio settings")).toHaveCount(0);
  });

  test("each side puts the bubble on that side of its trigger", async ({ page, isMobile }) => {
    test.skip(isMobile, "a touch screen never hovers");
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const label = side[0].toUpperCase() + side.slice(1);
      await gallerySection(page, "Tooltip").getByRole("button", { name: label, exact: true }).hover();
      await expect(bubble(page, label)).toHaveAttribute("data-side", side);
      await page.mouse.move(2, 2);
      await expect(bubble(page, label)).toHaveCount(0);
    }
  });
});

test.describe("Toast", () => {
  const section = (page: Page) => gallerySection(page, "Toast and Banner");
  const region = (page: Page) => page.getByRole("region", { name: "Notifications (F8)" });
  const toasts = (page: Page) => region(page).getByRole("listitem");

  test("a toast shows its title and description, and Dismiss removes it", async ({ page }) => {
    await section(page).getByRole("button", { name: "Connected to Raid Night" }).click();
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page)).toContainText("Connected to Raid Night");
    await expect(toasts(page)).toContainText("Voice is live at 41 ms.");
    await toasts(page).getByRole("button", { name: "Dismiss" }).click();
    await expect(toasts(page)).toHaveCount(0);
  });

  test("a danger toast is announced at once, and one with an action runs it", async ({ page }) => {
    await section(page).getByRole("button", { name: "Microphone blocked" }).click();
    // The announcement sits in a visually hidden live region that role queries do not return.
    await expect(page.locator('[role="alert"][aria-live="assertive"]')).toContainText("Notifications Microphone blocked");
    await toasts(page).getByRole("button", { name: "Retry" }).click();
    // The action raises another toast and the first one closes.
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page)).toContainText("Link copied");
  });

  test("F8 moves the focus to the stack", async ({ page }) => {
    await section(page).getByRole("button", { name: "Link copied" }).click();
    await expect(toasts(page)).toHaveCount(1);
    await page.keyboard.press("F8");
    expect(await focusIsIn(region(page))).toBe(true);
  });

  test("at most four toasts show, the oldest dropped first, and Dismiss clears them all", async ({ page }) => {
    for (const name of ["Connected to Raid Night", "Microphone blocked", "Could not move Kestrel to the channel", "Link copied", "Stays until dismissed"]) {
      await section(page).getByRole("button", { name, exact: true }).click();
    }
    await expect(toasts(page)).toHaveCount(4);
    await expect(region(page)).not.toContainText("Connected to Raid Night");
    await expect(region(page)).toContainText("Stays until dismissed");

    await section(page).getByRole("button", { name: "Dismiss", exact: true }).filter({ hasText: "Dismiss" }).click();
    await expect(toasts(page)).toHaveCount(0);
  });
});

test.describe("Banner", () => {
  const section = (page: Page) => gallerySection(page, "Toast and Banner");

  test("a danger banner is an alert and the others are polite statuses", async ({ page }) => {
    await expect(section(page).getByRole("alert")).toHaveCount(1);
    await expect(section(page).getByRole("alert")).toContainText("Could not reconnect");
    await expect(section(page).getByRole("status").filter({ hasText: "Reconnecting" })).toContainText("Trying again in 3 s.");
    await expect(section(page).getByRole("status").filter({ hasText: "Audio quality reduced" })).toBeVisible();
  });

  test("a banner's action is a button, and Dismiss only tells its owner, who hides it and can show it again", async ({ page }) => {
    await expect(section(page).getByRole("button", { name: "Retry now" })).toHaveCount(2);
    const poke = section(page).getByRole("status").filter({ hasText: "Kestrel poked you" });
    await expect(poke).toBeVisible();
    await poke.getByRole("button", { name: "Dismiss" }).click();
    await expect(poke).toHaveCount(0);
    await expect(section(page).getByText("Banner dismissed")).toBeVisible();

    await section(page).getByRole("button", { name: "Show again" }).click();
    await expect(section(page).getByRole("status").filter({ hasText: "Kestrel poked you" })).toBeVisible();
  });
});
