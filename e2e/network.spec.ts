import { expect, test } from "./fixtures";
import { join } from "./helpers";

// The network performance panel of the room header: a popover opened by its button, closed by Esc
// or a click outside, with the focus handed back to the button.

test.describe("network performance panel", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the phone header has no network button");
  });

  test("opens from the header button, Esc closes it and gives the focus back", async ({ page }) => {
    await join(page, "net-panel");
    const button = page.getByRole("button", { name: "Network performance" });
    const panel = page.getByRole("dialog", { name: "Network performance" });
    await expect(panel).toBeHidden();

    await button.click();
    await expect(panel).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByRole("button", { name: "Measure now" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("a click on the button again closes it", async ({ page }) => {
    await join(page, "net-panel-toggle");
    const button = page.getByRole("button", { name: "Network performance" });
    const panel = page.getByRole("dialog", { name: "Network performance" });
    await button.click();
    await expect(panel).toBeVisible();
    await button.click();
    await expect(panel).toBeHidden();
  });
});
