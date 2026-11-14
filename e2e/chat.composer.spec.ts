import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectComposerText, join, poll, selectedText, selectInComposer } from "./helpers";
import type { Gateway } from "../test/support/gateway";

// The message box: an editor that shows the formatting while it is typed, a formatting toolbar, line breaks, and the height that
// stops growing. Real gateway, fake TeamSpeak server.

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

/** Pastes `text` as a person would, which is the way to put many lines into the box at once. */
async function paste(box: Locator, text: string): Promise<void> {
  await box.evaluate((content, pasted) => {
    content.focus();
    const data = new DataTransfer();
    data.setData("text/plain", pasted);
    content.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

const lines = (count: number): string => Array.from({ length: count }, (_, i) => `line ${i}`).join("\n");

function sentBy(gateway: Gateway, nickname: string) {
  return gateway.ts.created.find((client) => client.options.nickname === nickname)!.sentMessages;
}

/** How the editor draws the first span with `text` in it. */
const look = (box: Locator, text: string) =>
  box
    .locator("span", { hasText: text })
    .last()
    .evaluate((span) => {
      const style = getComputedStyle(span);
      return {
        weight: style.fontWeight,
        italic: style.fontStyle,
        decoration: style.textDecorationLine,
        color: style.color,
        background: style.backgroundColor,
      };
    });

test.describe("formatting while typing", () => {
  test("shows each style in the text and fades the markers, which stay in the message", async ({ page }) => {
    await join(page, "compose-live");
    await openChat(page);
    const box = composer(page);
    await box.fill("**bold** *slant* ~~gone~~ ++under++ ||hidden||");
    await expectComposerText(box, "**bold** *slant* ~~gone~~ ++under++ ||hidden||");

    expect((await look(box, "bold")).weight).toBe("700");
    expect((await look(box, "slant")).italic).toBe("italic");
    expect((await look(box, "gone")).decoration).toContain("line-through");
    expect((await look(box, "under")).decoration).toContain("underline");

    // The spoiler is a bar behind its text, and a marker is quieter than the text it surrounds.
    const plain = await look(box.locator(".cm-line"), "bold");
    expect((await look(box, "hidden")).background).not.toBe(plain.background);
    const marker = await box
      .locator("span", { hasText: /^\*\*$/ })
      .first()
      .evaluate((span) => getComputedStyle(span).color);
    expect(marker).not.toBe(plain.color);
  });

  test("formats inside other formats and leaves unclosed markers alone", async ({ page }) => {
    await join(page, "compose-nested");
    await openChat(page);
    const box = composer(page);
    await box.fill("**bold *both*** and ++open");
    expect((await look(box, "both")).weight).toBe("700");
    expect((await look(box, "both")).italic).toBe("italic");
    // An unclosed marker styles nothing: its text stays a plain text node with no styled span around it.
    await expect(box.locator("span", { hasText: "open" })).toHaveCount(0);
  });

  test("shows headings, quotes and code lines in their own look", async ({ page }) => {
    await join(page, "compose-blocks");
    await openChat(page);
    const box = composer(page);
    await paste(box, "# Title\n> quoted\n`code`");
    await expectComposerText(box, "# Title\n> quoted\n`code`");
    expect((await look(box, "Title")).weight).toBe("700");
    expect((await look(box, "code")).background).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("keeps the caret in step with the text while styled text is typed", async ({ page }) => {
    await join(page, "compose-caret");
    await openChat(page);
    const box = composer(page);
    await box.focus();
    await page.keyboard.type("**ab**");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("X");
    await expectComposerText(box, "**aXb**");
  });

  test("a sent message keeps its markers, and the chat shows the result", async ({ page, gateway }) => {
    await join(page, "compose-send");
    await openChat(page);
    await composer(page).fill("**hello** ||secret||");
    await composer(page).press("Enter");
    await expect(page.getByRole("article").locator("strong", { hasText: "hello" })).toBeVisible();
    const sent = await poll(
      () => sentBy(gateway, "compose-send"),
      (messages) => messages.length > 0,
    );
    expect(sent[0].message).toBe("**hello** ||secret||");
  });
});

test.describe("formatting toolbar", () => {
  test("wraps the selection and sends the markup, which shows formatted in the message", async ({ page, gateway }) => {
    await join(page, "compose-bold");
    await openChat(page);
    await showToolbar(page);
    await composer(page).fill("hello world");
    await selectInComposer(page, composer(page), 0, 5);
    await toolbar(page).getByRole("button", { name: "Bold" }).click();

    await expectComposerText(composer(page), "**hello** world");
    await expect(composer(page)).toBeFocused();
    expect(await selectedText(page)).toBe("hello");

    await composer(page).press("Enter");
    await expect(page.getByRole("article").locator("strong", { hasText: "hello" })).toBeVisible();
    const sent = await poll(
      () => sentBy(gateway, "compose-bold"),
      (messages) => messages.length > 0,
    );
    expect(sent[0].message).toBe("**hello** world");
  });

  test("an action can be undone with Ctrl+Z", async ({ page }) => {
    await join(page, "compose-undo");
    await openChat(page);
    await showToolbar(page);
    await composer(page).fill("hello world");
    await selectInComposer(page, composer(page), 0, 5);
    await toolbar(page).getByRole("button", { name: "Bold" }).click();
    await expectComposerText(composer(page), "**hello** world");
    await composer(page).press("Control+z");
    await expectComposerText(composer(page), "hello world");
  });

  test("Ctrl+B and Ctrl+I format the selection from the keyboard", async ({ page }) => {
    await join(page, "compose-keys");
    await openChat(page);
    await composer(page).fill("hello");
    await selectInComposer(page, composer(page), 0, 5);
    await composer(page).press("Control+b");
    await expectComposerText(composer(page), "**hello**");
    await composer(page).press("Control+i");
    await expectComposerText(composer(page), "***hello***");
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
    await selectInComposer(page, composer(page), 0, 5);

    // A menu on a wide screen, a sheet with items that expand in place on a phone.
    const item = (name: string) => page.getByRole("menuitem", { name, exact: true }).or(page.getByRole("button", { name, exact: true }));
    await toolbar(page).getByRole("button", { name: "More" }).click();
    await item("Heading").click();
    await item("Heading 2").click();

    await expectComposerText(composer(page), "## title");
    await expect(composer(page)).toBeFocused();
  });

  test("a block from the More menu keeps the text inside it", async ({ page }) => {
    await join(page, "compose-block");
    await openChat(page);
    await showToolbar(page);
    await composer(page).fill("a note");
    await selectInComposer(page, composer(page), 0, 6);
    const item = (name: string) => page.getByRole("menuitem", { name, exact: true }).or(page.getByRole("button", { name, exact: true }));
    await toolbar(page).getByRole("button", { name: "More" }).click();
    await item("Code block").click();
    await expectComposerText(composer(page), "```\na note\n```");
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
    await expectComposerText(composer(page), "first\nsecond");

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
    const box = composer(page);
    const height = async () => box.evaluate((content) => content.closest(".cm-editor")!.getBoundingClientRect().height);
    const oneLine = await height();

    await paste(box, lines(3));
    await expect.poll(height).toBeGreaterThan(oneLine);
    const threeLines = await height();

    await paste(box, `\n${lines(60)}`);
    await expect.poll(height).toBeGreaterThan(threeLines);
    const many = await height();
    // The cap is 10rem, the box never gets taller than that and scrolls inside.
    expect(many).toBeLessThanOrEqual(161);
    const scroller = await box.evaluate((content) => {
      const element = content.closest(".cm-scroller")!;
      return { scrolls: element.scrollHeight > element.clientHeight, overflowY: getComputedStyle(element).overflowY };
    });
    expect(scroller).toEqual({ scrolls: true, overflowY: "auto" });

    // Many more lines change nothing, and the box is still on screen.
    await paste(box, `\n${lines(400)}`);
    expect(await height()).toBe(many);
    await expect(box).toBeInViewport();

    await box.press("Control+a");
    await box.press("Delete");
    await expect.poll(height).toBeLessThan(threeLines);
  });

  test("a long message leaves the chat list its room", async ({ page }) => {
    await join(page, "compose-room");
    await openChat(page);
    const list = page.getByRole("log").first();
    const before = (await list.boundingBox())!.height;
    await paste(composer(page), lines(200));
    const after = (await list.boundingBox())!.height;
    expect(after).toBeGreaterThan(before * 0.5);
  });

  test("the box stops at 8192 characters even when more is pasted", async ({ page }) => {
    await join(page, "compose-limit");
    await openChat(page);
    await paste(composer(page), "x".repeat(9000));
    await expectComposerText(composer(page), "x".repeat(8192));
  });
});
