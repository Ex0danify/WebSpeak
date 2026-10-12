import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gallerySection, openGallery } from "./helpers";

// The keyboard and label contracts of the form controls, as their doc comments state them, in the gallery on a Vite dev server.
// Behaviors of reka-ui and the browser that happy-dom cannot judge.

/**
 * A key press that lasts as long as a person's. reka-ui's radio checks itself from a `setTimeout(0)`
 * after the arrow key moved focus to it, and only if the key is still down then; Playwright's
 * default press releases it in the same instant, which no keyboard does.
 */
const holdKey = (page: Page, key: string) => page.keyboard.press(key, { delay: 50 });

test.beforeEach(async ({ page, galleryUrl }) => {
  await openGallery(page, galleryUrl);
});

test.describe("Button", () => {
  test("a toggle button follows Space and Enter and says so in aria-pressed", async ({ page }) => {
    const mute = gallerySection(page, "Button").getByRole("button", { name: "Mute microphone" });
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await mute.focus();
    await page.keyboard.press("Space");
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await expect(mute).toHaveAttribute("aria-pressed", "false");
  });

  test("a loading button is busy and ignores activation, and a click that starts loading works by keyboard", async ({ page }) => {
    const section = gallerySection(page, "Button");
    const start = section.getByRole("button", { name: "Click to load" });
    await expect(start).not.toHaveAttribute("aria-busy", "true");
    await start.focus();
    await page.keyboard.press("Enter");
    const busy = section.getByRole("button", { name: "Saving" });
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(section.getByRole("button", { name: "Reset" })).toBeVisible();

    // Activating it again does nothing: the click is stopped, so Reset is still the only way back.
    await busy.focus();
    await page.keyboard.press("Enter");
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await section.getByRole("button", { name: "Reset" }).click();
    await expect(section.getByRole("button", { name: "Click to load" })).not.toHaveAttribute("aria-busy", "true");
  });

  test("a disabled button is not reachable by Tab, and a disabled link is not followed", async ({ page }) => {
    const section = gallerySection(page, "Button");
    const disabled = section.getByRole("button", { name: "Disabled", exact: true });
    await expect(disabled).toBeDisabled();
    await disabled.evaluate((element) => (element.previousElementSibling as HTMLElement).focus());
    await page.keyboard.press("Tab");
    await expect(disabled).not.toBeFocused();

    const disabledLink = section.getByRole("link", { name: "Disabled link" });
    await expect(disabledLink).toHaveAttribute("aria-disabled", "true");
    await expect(disabledLink).toHaveAttribute("tabindex", "-1");
    await disabledLink.click({ force: true });
    expect(new URL(page.url()).hash).toBe("");
    await section.getByRole("link", { name: "Link button" }).click();
    expect(new URL(page.url()).hash).toBe("#gallery-button");
  });
});

test.describe("Field, Input, Select and Textarea", () => {
  test("a field's label names its control, and its hint or error describes it", async ({ page }) => {
    const section = gallerySection(page, "Field · Input · Select · Textarea");
    const nickname = section.getByRole("textbox", { name: "Nickname" }).first();
    await expect(nickname).toHaveAccessibleDescription("Shown to everyone in the channel.");
    await expect(nickname).not.toHaveAttribute("aria-invalid", "true");

    const server = section.getByRole("textbox", { name: "Server address" });
    await expect(server).toHaveAccessibleDescription("Could not reach this server.");
    await expect(server).toHaveAttribute("aria-invalid", "true");
  });

  test("typing reaches the bound value, and a disabled input takes none", async ({ page }) => {
    const section = gallerySection(page, "Field · Input · Select · Textarea");
    const nickname = section.getByRole("textbox", { name: "Nickname" }).first();
    await nickname.fill("Ibis");
    await expect(section.getByText(/nickname = Ibis/)).toBeVisible();
    // The second "Nickname" field is the locked one.
    const locked = section.getByRole("textbox", { name: "Nickname" }).nth(1);
    await expect(locked).toHaveValue("Locked");
    await expect(locked).toBeDisabled();

    const search = section.getByRole("textbox", { name: "Search channels" });
    await search.fill("raid");
    await expect(section.getByText(/query = raid/)).toBeVisible();
  });

  test("the native select keeps its keyboard: arrows and typing choose an option", async ({ page }) => {
    const section = gallerySection(page, "Field · Input · Select · Textarea");
    const region = section.getByRole("combobox", { name: "Audio region" }).first();
    await expect(region).toHaveValue("auto");
    await region.focus();
    await page.keyboard.press("ArrowDown");
    await expect(region).toHaveValue("eu");
    await expect(section.getByText(/region = eu/)).toBeVisible();
    await page.keyboard.type("North");
    await expect(region).toHaveValue("na");
    await expect(section.getByRole("combobox", { name: "Audio region" }).last()).toBeDisabled();
  });

  test("the textarea takes text and stops at its maxlength", async ({ page }) => {
    const section = gallerySection(page, "Field · Input · Select · Textarea");
    const notes = section.getByRole("textbox", { name: "Nickname" }).last();
    // Typed, not filled: a fill sets the value in one go and skips the limit.
    await notes.pressSequentially("z".repeat(505));
    await expect(notes).toHaveValue("z".repeat(500));
  });
});

test.describe("Switch", () => {
  test("Space toggles it, and its label names it", async ({ page }) => {
    const section = gallerySection(page, "Switch");
    const noise = section.getByRole("switch", { name: /Noise suppression/ });
    await expect(noise).toBeChecked();
    await noise.focus();
    await page.keyboard.press("Space");
    await expect(noise).not.toBeChecked();
    await expect(section.getByText(/noise = false/)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(noise).toBeChecked();

    // A click on the label toggles it too.
    const ptt = section.getByRole("switch", { name: /Push to talk/ });
    await expect(ptt).not.toBeChecked();
    await section.getByText("Push to talk", { exact: true }).click();
    await expect(ptt).toBeChecked();
  });

  test("a disabled switch cannot be toggled", async ({ page }) => {
    const section = gallerySection(page, "Switch");
    const off = section.getByRole("switch", { name: "Disabled off" });
    await expect(off).toBeDisabled();
    await off.click({ force: true });
    await expect(off).not.toBeChecked();
  });
});

test.describe("Checkbox and Radio", () => {
  test("Space toggles a checkbox", async ({ page }) => {
    const section = gallerySection(page, "Checkbox · Radio");
    const remember = section.getByRole("checkbox", { name: "Remember my nickname on this device" });
    await expect(remember).toBeChecked();
    await remember.focus();
    await page.keyboard.press("Space");
    await expect(remember).not.toBeChecked();
    await expect(section.getByText(/remember = false/)).toBeVisible();
  });

  test("the select-all checkbox is mixed while some are picked, and Space selects all, then none", async ({ page }) => {
    const section = gallerySection(page, "Checkbox · Radio");
    const all = section.getByRole("checkbox", { name: "Select all channels" });
    await expect(all).toBeChecked({ checked: false });
    await expect(all).toHaveAttribute("aria-checked", "mixed");
    await all.focus();
    await page.keyboard.press("Space");
    await expect(all).toHaveAttribute("aria-checked", "true");
    for (const name of ["Lobby", "Raid Night", "AFK"]) await expect(section.getByRole("checkbox", { name })).toBeChecked();
    await page.keyboard.press("Space");
    await expect(all).toHaveAttribute("aria-checked", "false");
    for (const name of ["Lobby", "Raid Night", "AFK"]) await expect(section.getByRole("checkbox", { name })).not.toBeChecked();

    await section.getByRole("checkbox", { name: "AFK" }).focus();
    await page.keyboard.press("Space");
    await expect(section.getByText(/picked = afk/)).toBeVisible();
    await expect(all).toHaveAttribute("aria-checked", "mixed");
  });

  test("a disabled checkbox cannot be toggled", async ({ page }) => {
    const section = gallerySection(page, "Checkbox · Radio");
    const disabled = section.getByRole("checkbox", { name: "Disabled", exact: true });
    await expect(disabled).toBeDisabled();
    await disabled.click({ force: true });
    await expect(disabled).not.toBeChecked();
  });

  test("a radio group is one tab stop on the chosen option, and arrows move the choice and skip a disabled one", async ({ page }) => {
    const section = gallerySection(page, "Checkbox · Radio");
    const group = section.getByRole("radiogroup", { name: "Transmit mode" });
    const ptt = group.getByRole("radio", { name: "Push to talk" });
    const vox = group.getByRole("radio", { name: "Voice activity" });
    await expect(vox).toBeChecked();
    await expect(group.getByRole("radio", { name: "Always on" })).toBeDisabled();

    // Only the chosen radio is in the tab order.
    await section.getByRole("checkbox", { name: "AFK" }).focus();
    await page.keyboard.press("Tab");
    await expect(vox).toBeFocused();

    await holdKey(page, "ArrowUp");
    await expect(ptt).toBeChecked();
    await expect(ptt).toBeFocused();
    await expect(section.getByText(/mode = ptt/)).toBeVisible();
    // Down from the first goes to the second, and down again skips the disabled third and wraps.
    await holdKey(page, "ArrowDown");
    await expect(vox).toBeChecked();
    await holdKey(page, "ArrowDown");
    await expect(ptt).toBeChecked();
  });
});

test.describe("Slider", () => {
  test("arrows, Home, End, PageUp and PageDown move it, and the value text is spoken", async ({ page }) => {
    const section = gallerySection(page, "Slider");
    const volume = section.getByRole("slider", { name: "Output volume" });
    await expect(volume).toHaveAttribute("aria-valuenow", "70");
    await expect(volume).toHaveAttribute("aria-valuetext", "70%");
    await volume.focus();
    await page.keyboard.press("ArrowRight");
    await expect(volume).toHaveAttribute("aria-valuenow", "71");
    await page.keyboard.press("ArrowUp");
    await expect(volume).toHaveAttribute("aria-valuenow", "72");
    await page.keyboard.press("ArrowLeft");
    await expect(volume).toHaveAttribute("aria-valuenow", "71");
    await page.keyboard.press("PageUp");
    await expect(volume).toHaveAttribute("aria-valuenow", "81");
    await page.keyboard.press("PageDown");
    await expect(volume).toHaveAttribute("aria-valuenow", "71");
    await page.keyboard.press("End");
    await expect(volume).toHaveAttribute("aria-valuenow", "100");
    await expect(volume).toHaveAttribute("aria-valuetext", "100%");
    await page.keyboard.press("ArrowRight");
    await expect(volume).toHaveAttribute("aria-valuenow", "100");
    await page.keyboard.press("Home");
    await expect(volume).toHaveAttribute("aria-valuenow", "0");
    await expect(section.getByText("0%", { exact: true })).toBeVisible();
  });

  test("a negative range moves by its step and ends at its limits", async ({ page }) => {
    const section = gallerySection(page, "Slider");
    const threshold = section.getByRole("slider", { name: "Voice activity threshold" });
    await expect(threshold).toHaveAttribute("aria-valuenow", "-42");
    await threshold.focus();
    await page.keyboard.press("ArrowRight");
    await expect(threshold).toHaveAttribute("aria-valuenow", "-40");
    await expect(section.getByText("-40 dB")).toBeVisible();
    await page.keyboard.press("Home");
    await expect(threshold).toHaveAttribute("aria-valuenow", "-60");
    await page.keyboard.press("End");
    await expect(threshold).toHaveAttribute("aria-valuenow", "0");
    await expect(threshold).toHaveAttribute("aria-valuetext", "0 decibels");
  });

  test("a disabled slider ignores the keyboard", async ({ page }) => {
    const disabled = gallerySection(page, "Slider").getByRole("slider", { name: "Disabled" });
    await expect(disabled).toBeDisabled();
    await disabled.focus();
    await page.keyboard.press("ArrowRight");
    await expect(disabled).toHaveAttribute("aria-valuenow", "35");
  });
});
