import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { join, memberRow, openSettings, poll, type Session, withAudioTone } from "./helpers";

// Muting, deafening and the audio dock of the connected view. The fake microphone plays a steady
// tone, so the browser keeps sending audio until the person mutes it. Launch options are set for
// the whole file (see `withAudioTone`).
test.use(withAudioTone({ frequencyHz: 1000 }));

const dock = (page: Page): Locator => page.getByRole("toolbar", { name: "Audio controls" });

/** The control that mutes the microphone: the dock's button on desktop, the More tab's on a phone. */
async function micButton(page: Page, state: "on" | "off"): Promise<Locator> {
  const more = page.getByRole("tab", { name: "More" });
  if (await more.isVisible()) {
    if ((await more.getAttribute("aria-selected")) !== "true") await more.click();
    return page.getByRole("button", { name: state === "on" ? "Mute mic" : "Unmute mic" });
  }
  return dock(page).getByRole("button", { name: state === "on" ? "Microphone on" : "Microphone off" });
}

/** Waits until a whole sampling window passes with no audio going up. The window is the observation, not a delay. */
async function expectUplinkStops(session: Session): Promise<void> {
  await poll(
    async () => {
      const before = session.binarySent;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return session.binarySent - before;
    },
    (frames) => frames === 0,
    { message: "the uplink to stop", timeoutMs: 5000 },
  );
}

test.describe("microphone mute", () => {
  test("muting stops the audio going up and unmuting starts it again", async ({ page, session }) => {
    await join(page, "aud-mute");
    await session.waitForBinary(10, "sent");

    await (await micButton(page, "on")).click();
    await expect(page.getByText("Microphone off", { exact: true }).first()).toBeVisible();
    await expectUplinkStops(session);
    const stopped = session.binarySent;
    await expect(await micButton(page, "off")).toBeVisible();
    expect(session.binarySent).toBe(stopped);

    await (await micButton(page, "off")).click();
    await session.waitForBinary(10, "sent");
  });

  test("the other members see the mute as a flag on your row, and its removal", async ({ page, openSession }) => {
    await join(page, "aud-flag-a");
    const other = await openSession();
    await join(other.page, "aud-flag-b");
    const flag = memberRow(other.page, "aud-flag-a").getByLabel("Microphone muted");
    await expect(flag).toHaveCount(0);

    await (await micButton(page, "on")).click();
    await expect(flag).toHaveCount(1);
    await (await micButton(page, "off")).click();
    await expect(flag).toHaveCount(0);
  });

  test("a mute is still on after a reload, announced again, and nothing goes up until it is lifted", async ({ page, session, openSession }) => {
    await join(page, "aud-mute-keep");
    const other = await openSession();
    await join(other.page, "aud-mute-keep-b");
    await session.waitForBinary(5, "sent");
    await (await micButton(page, "on")).click();
    await expectUplinkStops(session);

    await page.reload();
    await join(page, "aud-mute-keep");
    await expect(await micButton(page, "off")).toBeVisible();
    await expectUplinkStops(session);
    // The old client is gone (one client shows twice: on its row and on its voice card) and the new one carries the flag.
    await expect(other.page.getByText("aud-mute-keep", { exact: true })).toHaveCount(2);
    await expect(memberRow(other.page, "aud-mute-keep").getByLabel("Microphone muted")).toHaveCount(1);
  });
});

test("the mic level in the settings follows the microphone", async ({ page }) => {
  await join(page, "aud-meter");
  const { dialog } = await openSettings(page);
  const level = dialog.getByText("Mic level").locator("xpath=following-sibling::strong");
  // The tone is loud, so the level settles well above silence.
  await expect.poll(async () => Number.parseInt((await level.textContent()) ?? "0", 10)).toBeGreaterThan(10);
});

/** The panels of the dock exist for the eye and the accessibility tree only while hovered or focused. */
async function revealMicPanel(page: Page): Promise<void> {
  await dock(page).getByRole("button", { name: /^Microphone (on|off)$/ }).hover();
}
async function revealOutputPanel(page: Page): Promise<void> {
  await dock(page).getByRole("button", { name: /^(Mute all audio|Restore audio)$/ }).hover();
}

test.describe("audio dock", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the dock is the desktop's; a phone has the settings dialog and the More tab");
  });

  test("Mute all audio switches to Restore audio and back, and leaves the master volume alone", async ({ page }) => {
    await join(page, "aud-deafen");
    await revealOutputPanel(page);
    const master = dock(page).getByRole("slider", { name: "Master volume" });
    const before = await master.getAttribute("aria-valuenow");

    const mute = dock(page).getByRole("button", { name: "Mute all audio" });
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await mute.click();
    const restore = dock(page).getByRole("button", { name: "Restore audio" });
    await expect(restore).toHaveAttribute("aria-pressed", "true");
    await revealOutputPanel(page);
    await expect(master).toHaveAttribute("aria-valuenow", before!);
    await restore.click();
    await expect(dock(page).getByRole("button", { name: "Mute all audio" })).toHaveAttribute("aria-pressed", "false");
  });

  test("the microphone panel opens on hover and on keyboard focus, and closes again", async ({ page }) => {
    await join(page, "aud-panel-mic");
    const panel = dock(page).getByRole("dialog", { name: "Microphone" });
    const button = dock(page).getByRole("button", { name: "Microphone on" });
    await expect(panel).toBeHidden();

    await button.hover();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("slider", { name: "Input volume" })).toBeVisible();
    await expect(panel.getByRole("switch", { name: "Browser noise suppression" })).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(panel).toBeHidden();

    await button.focus();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(panel.getByRole("slider", { name: "Input volume" })).toBeFocused();
    await expect(panel).toBeVisible();
  });

  test("the master volume panel opens on hover and on keyboard focus", async ({ page }) => {
    await join(page, "aud-panel-out");
    const panel = dock(page).getByRole("dialog", { name: "Master volume" });
    const button = dock(page).getByRole("button", { name: "Mute all audio" });
    await expect(panel).toBeHidden();
    await button.hover();
    await expect(panel).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(panel).toBeHidden();
    await button.focus();
    await expect(panel).toBeVisible();
  });

  test("input volume, master volume and noise suppression take the keyboard and are still set after a reload", async ({ page }) => {
    await join(page, "aud-dock-keep");
    await revealMicPanel(page);
    const input = dock(page).getByRole("slider", { name: "Input volume" });
    const master = dock(page).getByRole("slider", { name: "Master volume" });
    const noise = dock(page).getByRole("switch", { name: "Browser noise suppression" });
    const noiseBefore = await noise.getAttribute("aria-checked");

    await input.focus();
    for (let press = 0; press < 5; press++) await page.keyboard.press("ArrowLeft");
    await expect(input).toHaveAttribute("aria-valuenow", "95");
    await revealOutputPanel(page);
    await master.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await expect(master).toHaveAttribute("aria-valuenow", "99");
    await revealMicPanel(page);
    await noise.focus();
    await page.keyboard.press("Space");
    await expect(noise).not.toHaveAttribute("aria-checked", noiseBefore!);
    const noiseAfter = await noise.getAttribute("aria-checked");

    await page.reload();
    await join(page, "aud-dock-keep");
    await revealOutputPanel(page);
    await expect(dock(page).getByRole("slider", { name: "Master volume" })).toHaveAttribute("aria-valuenow", "99");
    await revealMicPanel(page);
    await expect(dock(page).getByRole("slider", { name: "Input volume" })).toHaveAttribute("aria-valuenow", "95");
    await expect(dock(page).getByRole("switch", { name: "Browser noise suppression" })).toHaveAttribute("aria-checked", noiseAfter!);
  });
});
