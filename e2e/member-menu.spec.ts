import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { join, memberRow, openMemberMenu, poll } from "./helpers";
import type { Gateway } from "../test/support/gateway";

// The menu of another member, a popup on a right click on desktop and a bottom sheet on a phone (the row's "..." button or the
// `contextmenu` event a long press raises). Real gateway, fake TeamSpeak server, and a non-browser member comes from `script`.

/** An entry of the menu: an item of the popup, a button of the sheet. */
function action(menu: Locator, name: string): Locator {
  return menu.getByRole("menuitem", { name, exact: true }).or(menu.getByRole("button", { name, exact: true }));
}

/**
 * A channel in the "Move to" list. The popup's submenu is a second menu outside the first, so it is looked for on the page,
 * the sheet expands in place inside its own dialog.
 */
function channelItem(page: Page, menu: Locator, name: RegExp): Locator {
  return page.getByRole("menuitem", { name }).or(menu.getByRole("button", { name }));
}

/** Where the fake server has this member. */
function channelOf(gateway: Gateway, nickname: string): string | undefined {
  const member = [...gateway.ts.members.values()].find((candidate) => candidate.nickname === nickname);
  return member && gateway.ts.channels.get(member.channelID)?.name;
}

/** What the fake server was asked to poke, by whom. */
function pokesBy(gateway: Gateway, nickname: string) {
  return gateway.ts.created.find((client) => client.options.nickname === nickname)!.pokes;
}

test.describe("menu", () => {
  test("offers the actions for a member, with a volume control", async ({ page, script }) => {
    script.member("menu-other");
    await join(page, "menu-self");
    const menu = await openMemberMenu(page, "menu-other");

    for (const name of ["Private message", "Poke", "Set as whisper target", "Copy nickname", "Move to"])
      await expect(action(menu, name)).toBeVisible();
    await expect(menu.getByText("Member volume")).toBeVisible();
    // The heading of the popup, and the name of the sheet, is the member.
    await expect(menu).toContainText("menu-other");
  });

  test("has none for yourself", async ({ page, isMobile }) => {
    await join(page, "menu-alone");
    const row = memberRow(page, "menu-alone");
    if (isMobile) {
      await expect(row.getByRole("button", { name: "More member options" })).toHaveCount(0);
    } else {
      await row.click({ button: "right" });
      await expect(page.getByRole("menu")).toHaveCount(0);
    }
  });

  test("Esc closes it", async ({ page, script }) => {
    script.member("menu-esc-other");
    await join(page, "menu-esc-self");
    const menu = await openMemberMenu(page, "menu-esc-other");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(memberRow(page, "menu-esc-other")).toBeVisible();
  });

  test("a long press opens the sheet, and Close, the backdrop and Esc all close it", async ({ page, script, isMobile }) => {
    test.skip(!isMobile, "the sheet is the phone's menu");
    script.member("menu-press-other");
    await join(page, "menu-press-self");
    const sheet = page.getByRole("dialog", { name: "menu-press-other" });
    const longPress = () => memberRow(page, "menu-press-other").dispatchEvent("contextmenu");

    // Headless Chromium never raises `contextmenu` on a held touch, so the event a long press makes is sent by hand.
    await longPress();
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(sheet).toBeHidden();

    await longPress();
    await expect(sheet).toBeVisible();
    await page.mouse.click(195, 40);
    await expect(sheet).toBeHidden();

    await longPress();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });
});

test.describe("volume", () => {
  test("dragging a member's row by the nickname picks the member up", async ({ page, script, isMobile }) => {
    test.skip(isMobile, "a phone moves members through the menu");
    script.member("vol-drag-other");
    await join(page, "vol-drag-self");
    const row = memberRow(page, "vol-drag-other");
    await expect(row).toBeVisible();
    const name = (await row.getByText("vol-drag-other", { exact: true }).boundingBox())!;
    await page.mouse.move(name.x + 4, name.y + name.height / 2);
    await page.mouse.down();
    await page.mouse.move(name.x + 40, name.y + 30, { steps: 8 });
    await expect(row).toHaveClass(/(^|\s)dragging(\s|$)/);
    await page.mouse.up();
  });

  test("the volume bubble shows the decibels while the slider is dragged, and goes away on release", async ({ page, script, isMobile }) => {
    test.skip(isMobile, "the sheet's slider shows the same bubble; the popup is covered here");
    script.member("vol-db-other");
    await join(page, "vol-db-self");
    const menu = await openMemberMenu(page, "vol-db-other");
    const bubble = menu.getByText(/ dB$/);
    await expect(bubble).toBeHidden();
    const track = (await menu.getByRole("menuitem", { name: /^Member volume/ }).boundingBox())!;
    await page.mouse.move(track.x + track.width * 0.25, track.y + track.height - 8);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.5, track.y + track.height - 8, { steps: 6 });
    await expect(bubble).toHaveText(/^[+-]\d+\.\d dB$/);
    await page.mouse.up();
    await expect(bubble).toBeHidden();
  });

  test("the volume bubble also shows for a moment after an arrow key", async ({ page, script, isMobile }) => {
    test.skip(isMobile, "the sheet's slider is a plain slider with focus of its own");
    script.member("vol-key-other");
    await join(page, "vol-key-self");
    const menu = await openMemberMenu(page, "vol-key-other");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(menu.getByText(/ dB$/)).toHaveText("+0.4 dB");
    await expect(menu.getByText(/ dB$/)).toBeHidden();
  });

  test("Enter on the volume row restores 0 dB, and dragging next to 100% lands on it", async ({ page, script, isMobile }) => {
    test.skip(isMobile, "the sheet's slider resets with Enter on its thumb; the popup is covered here");
    script.member("vol-neutral-other");
    await join(page, "vol-neutral-self");
    const menu = await openMemberMenu(page, "vol-neutral-other");
    await page.keyboard.press("ArrowDown");
    const row = menu.getByRole("menuitem", { name: /^Member volume/ });
    await page.keyboard.press("End");
    await expect(row).toHaveAccessibleName("Member volume: 400%");
    await page.keyboard.press("Enter");
    await expect(row).toHaveAccessibleName("Member volume: 100%");
    await expect(page.getByRole("menu")).toBeVisible();

    // A drag that ends two pixels off unity still lands on it; without the snap that is about 102%.
    const thumb = (await row.locator("[role=slider]").boundingBox())!;
    const y = thumb.y + thumb.height / 2;
    await page.mouse.move(thumb.x + thumb.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(thumb.x + thumb.width / 2 + 2, y, { steps: 3 });
    await expect(row).toHaveAccessibleName("Member volume: 100%");
    await page.mouse.up();
  });

  test("a double click on the volume slider restores 0 dB", async ({ page, script, isMobile }) => {
    test.skip(isMobile, "a phone has no double click on a slider; the thumb's Enter key covers it");
    script.member("vol-dbl-other");
    await join(page, "vol-dbl-self");
    const menu = await openMemberMenu(page, "vol-dbl-other");
    await page.keyboard.press("ArrowDown");
    const row = menu.getByRole("menuitem", { name: /^Member volume/ });
    await page.keyboard.press("End");
    await expect(row).toHaveAccessibleName("Member volume: 400%");
    const box = (await row.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height - 8);
    await expect(row).toHaveAccessibleName("Member volume: 100%");
  });

  test("the sheet's slider can still be stepped through 100% with the arrow keys, and Enter restores it", async ({
    page,
    script,
    isMobile,
  }) => {
    test.skip(!isMobile, "the sheet is the phone's menu");
    script.member("vol-step-other");
    await join(page, "vol-step-self");
    const sheet = await openMemberMenu(page, "vol-step-other");
    const slider = sheet.getByRole("slider", { name: "Member volume" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "102");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuenow", "99");
    await page.keyboard.press("Enter");
    await expect(slider).toHaveAttribute("aria-valuenow", "100");
  });

  test("closing the menu puts the focus back on the member's row", async ({ page, script, isMobile }) => {
    test.skip(isMobile, "a phone's sheet returns the focus to its own trigger");
    script.member("vol-focus-other");
    await join(page, "vol-focus-self");
    await openMemberMenu(page, "vol-focus-other");
    await page.keyboard.press("Escape");
    await expect(memberRow(page, "vol-focus-other")).toBeFocused();
  });

  test("the menu's volume changes by 5 with the arrow keys and jumps with Home and End (popup)", async ({ page, script, isMobile }) => {
    test.skip(isMobile, "the popup's volume row is an item; the sheet has a plain slider");
    script.member("vol-menu-other");
    await join(page, "vol-menu-self");
    await openMemberMenu(page, "vol-menu-other");
    await page.keyboard.press("ArrowDown");
    const row = page.getByRole("menuitem", { name: /^Member volume/ });
    await expect(row).toBeFocused();
    await expect(row).toHaveAccessibleName("Member volume: 100%");

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(row).toHaveAccessibleName("Member volume: 110%");
    await page.keyboard.press("ArrowLeft");
    await expect(row).toHaveAccessibleName("Member volume: 105%");
    await page.keyboard.press("End");
    await expect(row).toHaveAccessibleName("Member volume: 400%");
    await page.keyboard.press("Home");
    await expect(row).toHaveAccessibleName("Member volume: 0%");
    // The menu stays open while the value changes.
    await expect(page.getByRole("menu")).toBeVisible();
  });

  test("the sheet's volume is a slider that takes the arrow keys, Home and End", async ({ page, script, isMobile }) => {
    test.skip(!isMobile, "the sheet is the phone's menu");
    script.member("vol-sheet-other");
    await join(page, "vol-sheet-self");
    const sheet = await openMemberMenu(page, "vol-sheet-other");
    const slider = sheet.getByRole("slider", { name: "Member volume" });
    await expect(slider).toHaveAttribute("aria-valuenow", "100");

    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "101");
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "400");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
  });
});

test.describe("poke and copy", () => {
  // Poking asks for a message with the browser's prompt.
  async function poke(page: Page, nickname: string, answer: string | null) {
    let asked = "";
    page.once("dialog", (dialog) => {
      asked = `${dialog.type()}: ${dialog.message()}`;
      return answer === null ? dialog.dismiss() : dialog.accept(answer);
    });
    const menu = await openMemberMenu(page, nickname);
    await action(menu, "Poke").click();
    await expect(page.getByText("Poke sent", { exact: true })).toBeVisible();
    return asked;
  }

  test("a poke carries the message that was typed, and says it was sent", async ({ page, gateway, script }) => {
    const target = script.member("poke-target");
    await join(page, "poke-self");
    expect(await poke(page, "poke-target", "wake up")).toBe("prompt: Poke message (optional)");
    expect(
      await poll(
        () => pokesBy(gateway, "poke-self"),
        (pokes) => pokes.length > 0,
      ),
    ).toEqual([{ clientId: target.id, message: "wake up" }]);
  });

  test("cancelling the message prompt still pokes, without a message", async ({ page, gateway, script }) => {
    const target = script.member("poke-cancel-target");
    await join(page, "poke-cancel-self");
    await poke(page, "poke-cancel-target", null);
    expect(
      await poll(
        () => pokesBy(gateway, "poke-cancel-self"),
        (pokes) => pokes.length > 0,
      ),
    ).toEqual([{ clientId: target.id, message: "" }]);
  });

  test("Copy nickname puts the nickname on the clipboard and says so", async ({ page, context, script }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    script.member("copy-target");
    await join(page, "copy-self");
    await action(await openMemberMenu(page, "copy-target"), "Copy nickname").click();
    await expect(page.getByText("Nickname copied", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("copy-target");
  });

  test("a clipboard that refuses is reported, not swallowed", async ({ page, script }) => {
    script.member("copy-refused-target");
    await join(page, "copy-refused-self");
    await page.evaluate(() =>
      Object.defineProperty(navigator.clipboard, "writeText", { value: () => Promise.reject(new Error("denied")) }),
    );
    await action(await openMemberMenu(page, "copy-refused-target"), "Copy nickname").click();
    await expect(page.getByText("Copy failed. Copy the browser address manually", { exact: true })).toBeVisible();
    await expect(page.getByText("Nickname copied", { exact: true })).toBeHidden();
  });
});

test.describe("move to channel", () => {
  test("lists the channels, and an administrator moves the member with a click", async ({ page, gateway, script }) => {
    script.allowMoves();
    const here = script.channel("move-here");
    script.channel("move-there");
    script.member("move-target", here);
    await join(page, "move-self");
    await page.getByRole("button", { name: /^move-here \d+$/ }).click();
    await expect(page.getByRole("button", { name: "move-here 2" })).toBeVisible();

    const menu = await openMemberMenu(page, "move-target");
    await action(menu, "Move to").click();
    // The member's own channel is offered as "My channel" (this is yours too), and it is not a move.
    await expect(channelItem(page, menu, /^My channel/)).toBeDisabled();
    await channelItem(page, menu, /move-there/).click();

    await expect(page.getByText("Member moved", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "move-there 1" })).toBeVisible();
    expect(channelOf(gateway, "move-target")).toBe("move-there");
  });

  test("a guest is refused, the member stays, and the reason is shown", async ({ page, gateway, script }) => {
    script.channel("refused-there");
    script.member("refused-target");
    await join(page, "refused-self");
    const menu = await openMemberMenu(page, "refused-target");
    await action(menu, "Move to").click();
    await channelItem(page, menu, /refused-there/).click();

    await expect(page.getByText("You do not have permission to perform this action", { exact: true })).toBeVisible();
    await expect(page.getByText("Member moved", { exact: true })).toBeHidden();
    expect(channelOf(gateway, "refused-target")).toBe("Lobby");
  });
});
