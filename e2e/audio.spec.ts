import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { join, memberRow, openSettings, poll, type Session, withAudioTone } from "./helpers";

// Muting, deafening and the audio dock of the connected view. The fake microphone plays a steady
// tone, so the browser keeps sending audio until the person mutes it. Launch options are set for
// the whole file (see `withAudioTone`).
test.use(withAudioTone({ frequencyHz: 1000 }));

const dock = (page: Page): Locator => page.getByRole("toolbar", { name: "Audio controls" });

/** The control that mutes the microphone, the dock's button on desktop and the More tab's on a phone. */
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

  test("a mute is still on after a reload, announced again, and nothing goes up until it is lifted", async ({
    page,
    session,
    openSession,
  }) => {
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

test.describe("audio dock", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the dock is the desktop's; a phone has the settings dialog and the More tab");
  });

  test("Mute all audio switches to Restore audio and back", async ({ page }) => {
    await join(page, "aud-deafen");
    const mute = dock(page).getByRole("button", { name: "Mute all audio" });
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await mute.click();
    const restore = dock(page).getByRole("button", { name: "Restore audio" });
    await expect(restore).toHaveAttribute("aria-pressed", "true");
    await restore.click();
    await expect(dock(page).getByRole("button", { name: "Mute all audio" })).toHaveAttribute("aria-pressed", "false");
  });

  test("the mute buttons open nothing, not on hover and not on click", async ({ page }) => {
    await join(page, "aud-no-popup");
    for (const name of [/^Microphone (on|off)$/, /^(Mute all audio|Restore audio)$/]) {
      const button = dock(page).getByRole("button", { name });
      await button.hover();
      await button.click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.mouse.move(2, 2);
    }
  });

  test("the options popover opens on click and closes with Escape, the focus goes back to the button", async ({ page }) => {
    await join(page, "aud-options");
    const button = dock(page).getByRole("button", { name: "Audio options" });
    const panel = page.getByRole("dialog", { name: "Audio options" });
    await button.hover();
    await expect(panel).toBeHidden();

    await button.click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("switch", { name: "Share audio" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("the options popover opens the audio settings and closes", async ({ page }) => {
    await join(page, "aud-options-settings");
    const { dialog } = await openSettings(page);
    await expect(page.getByRole("dialog", { name: "Audio options" })).toBeHidden();
    await expect(dialog).toBeVisible();
  });

  test("the share screen button opens the share settings", async ({ page }) => {
    await join(page, "aud-share-open");
    await dock(page).getByRole("button", { name: "Share screen" }).click();
    await expect(page.getByRole("dialog", { name: "Share settings" })).toBeVisible();
  });

  test("the stop sharing confirmation stays above the dock, and confirming ends the share", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext("2d")!;
        setInterval(() => context.fillRect(0, 0, 320, 180), 100);
        return canvas.captureStream(10);
      };
    });
    await join(page, "aud-share-stop");
    await dock(page).getByRole("button", { name: "Share screen" }).click();
    await page
      .getByRole("dialog", { name: "Share settings" })
      .getByRole("button", { name: /Start|Share/ })
      .first()
      .click();
    const live = dock(page).getByRole("button", { name: /^Sharing your screen/ });
    await expect(live).toBeVisible();

    await live.click();
    const panel = page.getByRole("dialog", { name: "Stop sharing" });
    await expect(panel).toBeVisible();
    const [dockBox, panelBox] = [await dock(page).boundingBox(), await panel.boundingBox()];
    expect(panelBox!.x).toBeGreaterThanOrEqual(dockBox!.x);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(dockBox!.x + dockBox!.width);

    await panel.getByRole("button", { name: "Stop sharing" }).click();
    await expect(dock(page).getByRole("button", { name: "Share screen" })).toBeVisible();
  });

  test("input volume, output volume and noise suppression take the keyboard and are still set after a reload", async ({ page }) => {
    await join(page, "aud-dock-keep");
    const { dialog } = await openSettings(page);
    const input = dialog.getByRole("slider", { name: "Input volume" });
    const output = dialog.getByRole("slider", { name: "Speakers" });
    const noise = dialog.getByRole("switch", { name: "Browser noise suppression" });
    const noiseBefore = await noise.getAttribute("aria-checked");

    await input.focus();
    for (let press = 0; press < 5; press++) await page.keyboard.press("ArrowLeft");
    await expect(input).toHaveAttribute("aria-valuenow", "95");
    await output.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await expect(output).toHaveAttribute("aria-valuenow", "99");
    await noise.focus();
    await page.keyboard.press("Space");
    await expect(noise).not.toHaveAttribute("aria-checked", noiseBefore!);
    const noiseAfter = await noise.getAttribute("aria-checked");

    await page.reload();
    await join(page, "aud-dock-keep");
    const again = (await openSettings(page)).dialog;
    await expect(again.getByRole("slider", { name: "Speakers" })).toHaveAttribute("aria-valuenow", "99");
    await expect(again.getByRole("slider", { name: "Input volume" })).toHaveAttribute("aria-valuenow", "95");
    await expect(again.getByRole("switch", { name: "Browser noise suppression" })).toHaveAttribute("aria-checked", noiseAfter!);
  });
});

test.describe("audio dock on a phone", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "the desktop's dock is covered above");
  });

  test("sits in the voice view with the same controls", async ({ page }) => {
    await join(page, "aud-phone-dock");
    await page.getByRole("tab", { name: "Voice" }).click();
    await expect(dock(page)).toBeVisible();
    await dock(page).getByRole("button", { name: "Microphone on" }).click();
    await expect(dock(page).getByRole("button", { name: "Microphone off" })).toHaveAttribute("aria-pressed", "true");

    await dock(page).getByRole("button", { name: "Audio options" }).click();
    const panel = page.getByRole("dialog", { name: "Audio options" });
    await expect(panel.getByRole("switch", { name: "Share audio" })).toBeVisible();
    await panel.getByRole("button", { name: "Audio settings" }).click();
    await expect(page.getByRole("dialog", { name: "Audio configuration" })).toBeVisible();
  });
});
