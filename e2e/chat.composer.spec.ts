import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { join, poll } from "./helpers";
import type { Gateway } from "../test/support/gateway";

// The message box: formatting toolbar, line breaks, and the height that stops growing. Real gateway, fake TeamSpeak server.

async function openChat(page: Page): Promise<void> {
  const tab = page.getByRole("tab", { name: "Chat" });
  if (await tab.isVisible()) await tab.click();
}

const composer = (page: Page): Locator => page.getByRole("textbox", { name: "Send" });
const toolbar = (page: Page): Locator => page.getByRole("toolbar", { name: "Text formatting" });

/** The toolbar is closed on a phone until its toggle is used. */
async function showToolbar(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Show formatting" });
  if (await toggle.isVisible()) await toggle.click();
  await expect(toolbar(page)).toBeVisible();
}

/** Selects `start` to `end` in the box the way a drag would. */
async function select(page: Page, start: number, end: number): Promise<void> {
  await composer(page).evaluate(
    (box: HTMLTextAreaElement, [from, to]) => {
      box.focus();
      box.setSelectionRange(from!, to!);
    },
    [start, end],
  );
}

const selected = (page: Page): Promise<string> =>
  composer(page).evaluate((box: HTMLTextAreaElement) => box.value.slice(box.selectionStart, box.selectionEnd));

function sentBy(gateway: Gateway, nickname: string) {
  return gateway.ts.created.find((client) => client.options.nickname === nickname)!.sentMessages;
}

test.describe("formatting toolbar", () => {
  test("wraps the selection and sends the markup, which shows formatted in the message", async ({ page, gateway }) => {
    await join(page, "compose-bold");
    await openChat(page);
    await showToolbar(page);
    await composer(page).fill("hello world");
    await select(page, 0, 5);
    await toolbar(page).getByRole("button", { name: "Bold" }).click();

    await expect(composer(page)).toHaveValue("**hello** world");
    await expect(composer(page)).toBeFocused();
    expect(await selected(page)).toBe("hello");

    await composer(page).press("Enter");
    await expect(page.getByRole("article").locator("strong", { hasText: "hello" })).toBeVisible();
    const sent = await poll(
      () => sentBy(gateway, "compose-bold"),
      (messages) => messages.length > 0,
    );
    expect(sent[0].message).toBe("**hello** world");
  });

  test("Ctrl+B and Ctrl+I format the selection from the keyboard", async ({ page }) => {
    await join(page, "compose-keys");
    await openChat(page);
    await composer(page).fill("hello");
    await select(page, 0, 5);
    await composer(page).press("Control+b");
    await expect(composer(page)).toHaveValue("**hello**");
    await composer(page).press("Control+i");
    await expect(composer(page)).toHaveValue("***hello***");
  });

  test("the toolbar is one tab stop and the arrow keys move along it", async ({ page }) => {
    await join(page, "compose-roving");
    await openChat(page);
    await showToolbar(page);
    const bold = toolbar(page).getByRole("button", { name: "Bold" });
    await bold.focus();
    await page.keyboard.press("ArrowRight");
    await expect(toolbar(page).getByRole("button", { name: "Italic" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(toolbar(page).getByRole("button", { name: "More" })).toBeFocused();
  });

  test("the More menu reaches the rest, and a choice lands in the box", async ({ page }) => {
    await join(page, "compose-more");
    await openChat(page);
    await showToolbar(page);
    await composer(page).fill("title");
    await select(page, 0, 5);

    // A menu on a wide screen, a sheet with items that expand in place on a phone.
    const item = (name: string) => page.getByRole("menuitem", { name, exact: true }).or(page.getByRole("button", { name, exact: true }));
    await toolbar(page).getByRole("button", { name: "More" }).click();
    await item("Heading").click();
    await item("Heading 2").click();

    await expect(composer(page)).toHaveValue("## title");
    await expect(composer(page)).toBeFocused();
  });

  test("a block from the More menu keeps the text inside it", async ({ page }) => {
    await join(page, "compose-block");
    await openChat(page);
    await showToolbar(page);
    await composer(page).fill("a note");
    await select(page, 0, 6);
    const item = (name: string) => page.getByRole("menuitem", { name, exact: true }).or(page.getByRole("button", { name, exact: true }));
    await toolbar(page).getByRole("button", { name: "More" }).click();
    await item("Code block").click();
    await expect(composer(page)).toHaveValue("```\na note\n```");
  });

  test("a phone keeps the toolbar behind a toggle", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the desktop toolbar is always open");
    await join(page, "compose-toggle");
    await openChat(page);
    await expect(toolbar(page)).toBeHidden();
    const toggle = page.getByRole("button", { name: "Show formatting" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toolbar(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide formatting" })).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("line breaks and height", () => {
  test("Shift+Enter starts a new line, Enter sends both, and the message shows them as lines", async ({ page, gateway }) => {
    await join(page, "compose-lines");
    await openChat(page);
    await composer(page).fill("first");
    await composer(page).press("Shift+Enter");
    await composer(page).pressSequentially("second");
    await expect(composer(page)).toHaveValue("first\nsecond");

    await composer(page).press("Enter");
    await expect(page.getByRole("article").filter({ hasText: "first" }).filter({ hasText: "second" })).toBeVisible();
    const sent = await poll(
      () => sentBy(gateway, "compose-lines"),
      (messages) => messages.length > 0,
    );
    expect(sent[0].message).toBe("first\nsecond");
  });

  test("the box grows with the text, then keeps its height and scrolls", async ({ page }) => {
    await join(page, "compose-grow");
    await openChat(page);
    const height = async () => (await composer(page).boundingBox())!.height;
    const oneLine = await height();

    await composer(page).fill(Array.from({ length: 3 }, (_, i) => `line ${i}`).join("\n"));
    const threeLines = await height();
    expect(threeLines).toBeGreaterThan(oneLine);

    await composer(page).fill(Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n"));
    const many = await height();
    // The cap is 10rem, the box never gets taller than that and scrolls inside.
    expect(many).toBeLessThanOrEqual(161);
    const overflow = await composer(page).evaluate((box: HTMLTextAreaElement) => ({
      scrolls: box.scrollHeight > box.clientHeight,
      overflowY: getComputedStyle(box).overflowY,
    }));
    expect(overflow).toEqual({ scrolls: true, overflowY: "auto" });

    // A few hundred more lines change nothing, and the box is still on screen.
    await composer(page).fill(Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n"));
    expect(await height()).toBe(many);
    await expect(composer(page)).toBeInViewport();

    await composer(page).fill("");
    expect(await height()).toBeLessThan(threeLines);
  });

  test("a long message leaves the chat list its room", async ({ page }) => {
    await join(page, "compose-room");
    await openChat(page);
    const list = page.getByRole("log").first();
    const before = (await list.boundingBox())!.height;
    await composer(page).fill(Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"));
    const after = (await list.boundingBox())!.height;
    expect(after).toBeGreaterThan(before * 0.5);
  });
});
