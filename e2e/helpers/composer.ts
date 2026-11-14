import { expect, type Locator, type Page } from "@playwright/test";

// The message box is a rich editor, a div with `contenteditable`, so it has no `value`. These read and select its text the way a
// person would see and drag it.

/** The text in the box, lines joined by a line break. The placeholder is not part of it. */
export const composerText = (box: Locator): Promise<string> =>
  box.evaluate((content) =>
    [...content.querySelectorAll(".cm-line")]
      .map((line) =>
        [...line.childNodes]
          .filter((node) => !(node instanceof Element && node.classList.contains("cm-placeholder")))
          .map((node) => node.textContent)
          .join(""),
      )
      .join("\n"),
  );

/** Waits for the box to hold exactly `expected`. */
export async function expectComposerText(box: Locator, expected: string): Promise<void> {
  await expect.poll(() => composerText(box)).toBe(expected);
}

/** The text that is selected in the page right now. */
export const selectedText = (page: Page): Promise<string> => page.evaluate(() => window.getSelection()?.toString() ?? "");

/** Selects `from` to `to` of the first line with the keyboard. */
export async function selectInComposer(page: Page, box: Locator, from: number, to: number): Promise<void> {
  await box.focus();
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < from; i++) await page.keyboard.press("ArrowRight");
  for (let i = from; i < to; i++) await page.keyboard.press("Shift+ArrowRight");
}
