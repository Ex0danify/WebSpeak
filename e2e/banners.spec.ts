import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { installVoiceFixture, type ScriptedGateway } from "./fixtures/scripted-gateway";
import { expectInRoom, join, openMemberMenu, submitJoin } from "./helpers";

// Banners stay in the layout until the situation changes, toasts are for something that happened and can be forgotten. The
// reconnect states, audio notice and stacked pokes come from the scripted gateway, a person's poke and an action's toast go
// through the real one.

/** Joins on the scripted gateway and opens the Voice tab of a phone, where the banners are. */
async function scriptedRoom(page: Page): Promise<ScriptedGateway> {
  const scripted = await installVoiceFixture(page.context());
  // The scripted gateway names you "Snapshot Tester" in its member list, so the form asks for that.
  await submitJoin(page, "Snapshot Tester");
  await expectInRoom(page, "Snapshot Tester");
  await showBanners(page);
  return scripted;
}

/** The member list, which a phone shows on its Channels tab. */
async function showMembers(page: Page): Promise<void> {
  const channelsTab = page.getByRole("tab", { name: "Channels" });
  if (await channelsTab.isVisible()) await channelsTab.click();
}

async function showBanners(page: Page): Promise<void> {
  const voiceTab = page.getByRole("tab", { name: "Voice" });
  if (await voiceTab.isVisible()) await voiceTab.click();
}

const reconnecting = (page: Page): Locator => page.getByRole("status").filter({ hasText: "Connection interrupted" });
const failed = (page: Page): Locator => page.getByRole("alert").filter({ hasText: "Could not restore the connection" });
const audioNotice = (page: Page): Locator => page.getByRole("status").filter({ hasText: "Audio status" });
const pokes = (page: Page): Locator => page.getByRole("status").filter({ hasText: "poked you" });

test.describe("reconnect banner", () => {
  test("says the connection was interrupted, follows the attempt number and clears when it is back", async ({ page }) => {
    const scripted = await scriptedRoom(page);
    scripted.send({ type: "reconnecting", attempt: 2 });
    await expect(reconnecting(page)).toContainText("Reconnecting… Attempt 2");
    scripted.send({ type: "reconnecting", attempt: 3 });
    await expect(reconnecting(page)).toContainText("Reconnecting… Attempt 3");
    // While it is trying there is nothing to retry by hand, only a way out.
    await expect(reconnecting(page).getByRole("button", { name: "Reconnect now" })).toHaveCount(0);
    await expect(reconnecting(page).getByRole("button", { name: "Back" })).toBeVisible();

    scripted.send({ type: "reconnected" });
    await expect(reconnecting(page)).toBeHidden();
    await expect(failed(page)).toBeHidden();
  });

  test("Back leaves for the join form, with the nickname still filled in", async ({ page }) => {
    const scripted = await scriptedRoom(page);
    scripted.send({ type: "reconnecting", attempt: 1 });
    await reconnecting(page).getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("button", { name: "Enter voice space" })).toBeVisible();
    await expect(page.getByLabel("Your nickname")).toHaveValue("Snapshot Tester");
    await expect(reconnecting(page)).toBeHidden();
  });
});

test.describe("failed reconnect banner", () => {
  test("is an alert with the reason, and Reconnect now starts a new join that brings the room back", async ({ page }) => {
    const scripted = await scriptedRoom(page);
    scripted.send({ type: "reconnectFailed", code: "CONNECTION_FAILED" });
    await expect(failed(page)).toBeVisible();
    await expect(failed(page).getByRole("button", { name: "Back" })).toBeVisible();
    expect(scripted.tickets).toHaveLength(1);

    await failed(page).getByRole("button", { name: "Reconnect now" }).click();
    await expect(failed(page)).toBeHidden();
    await showMembers(page);
    await expectInRoom(page, "Snapshot Tester");
    expect(scripted.tickets).toHaveLength(2);
    expect(scripted.connections).toBe(2);
  });

  test("Back leaves for the join form", async ({ page }) => {
    const scripted = await scriptedRoom(page);
    scripted.send({ type: "reconnectFailed", code: "CONNECTION_FAILED" });
    await failed(page).getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("button", { name: "Enter voice space" })).toBeVisible();
  });
});

test.describe("audio notice", () => {
  test("explains that audio could not be encoded, with the code, and keeps the room usable", async ({ page }) => {
    const scripted = await scriptedRoom(page);
    await expect(audioNotice(page)).toHaveCount(0);
    scripted.send({ type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "opus encoder unavailable" });
    await expect(audioNotice(page)).toContainText("Microphone audio could not be encoded (error code: AUDIO_ENCODER_UNAVAILABLE)");
    await expect(audioNotice(page)).toContainText("Other members may not hear you");
    await showMembers(page);
    await expectInRoom(page, "Snapshot Tester");
  });
});

test.describe("poke banners", () => {
  test("a poke from a person shows who poked and what they wrote, and Close removes it", async ({ page, gateway, script }) => {
    const poker = script.member("bnr-poker");
    await join(page, "bnr-poked");
    await showBanners(page);
    const client = gateway.ts.created.find((created) => created.options.nickname === "bnr-poked")!;
    poker.poke(client, "wake up");

    await expect(pokes(page)).toHaveCount(1);
    await expect(pokes(page)).toContainText("bnr-poker poked you");
    await expect(pokes(page)).toContainText("wake up");
    await pokes(page).getByRole("button", { name: "Close" }).click();
    await expect(pokes(page)).toHaveCount(0);
  });

  test("a poke without a message is just the title", async ({ page, gateway, script }) => {
    const poker = script.member("bnr-quiet-poker");
    await join(page, "bnr-quiet-poked");
    await showBanners(page);
    poker.poke(
      gateway.ts.created.find((created) => created.options.nickname === "bnr-quiet-poked")!,
      "",
    );
    await expect(pokes(page)).toHaveText(/^\s*bnr-quiet-poker poked you\s*$/);
  });

  test("two pokes are stacked one under the other without overlapping, and only three show at a time", async ({ page }) => {
    const scripted = await scriptedRoom(page);
    const poke = (id: number, name: string) =>
      scripted.send({
        type: "pokeReceived",
        invokerId: id,
        invokerUid: `uid-${id}`,
        invokerName: name,
        message: `from ${name}`,
        timestamp: Date.now(),
      });

    poke(11, "First Poker");
    poke(12, "Second Poker");
    await expect(pokes(page)).toHaveCount(2);
    const boxes = await pokes(page).evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect()).map(({ top, bottom, left, right }) => ({ top, bottom, left, right })),
    );
    boxes.sort((a, b) => a.top - b.top);
    expect(boxes[0].bottom).toBeLessThanOrEqual(boxes[1].top);
    expect(boxes[0].left).toBeLessThan(boxes[0].right);

    poke(13, "Third Poker");
    poke(14, "Fourth Poker");
    await expect(pokes(page).filter({ hasText: "Fourth Poker" })).toHaveCount(1);
    await expect(pokes(page)).toHaveCount(3);
    await expect(pokes(page).filter({ hasText: "First Poker" })).toHaveCount(0);
    // The pokes are a queue that shows its last three: closing one lets an older one that was
    // waiting take the free place.
    await pokes(page).filter({ hasText: "Third Poker" }).getByRole("button", { name: "Close" }).click();
    await expect(pokes(page).filter({ hasText: "Third Poker" })).toHaveCount(0);
    await expect(pokes(page)).toHaveCount(3);
    await expect(pokes(page).filter({ hasText: "First Poker" })).toHaveCount(1);
    await expect(pokes(page).filter({ hasText: "Fourth Poker" })).toHaveCount(1);
  });
});

test.describe("toasts", () => {
  // Poking someone raises the "Poke sent" toast; the dialog asks for the poke's message first.
  async function sendPoke(page: Page, target: string): Promise<Locator> {
    await (await openMemberMenu(page, target)).getByText("Poke", { exact: true }).click();
    await page.getByRole("dialog", { name: `Poke ${target}` }).getByRole("button", { name: "Poke", exact: true }).click();
    const toast = page.locator("li").filter({ hasText: "Poke sent" });
    await expect(toast).toBeVisible();
    return toast;
  }

  test("Close dismisses a toast at once", async ({ page, script }) => {
    script.member("toast-close-other");
    await join(page, "toast-close-self");
    const toast = await sendPoke(page, "toast-close-other");
    await toast.getByRole("button", { name: "Close" }).click();
    await expect(toast).toBeHidden();
  });

  test("a toast goes away by itself after about 2.8 seconds, not at once and not much later", async ({ page, script }) => {
    script.member("toast-timer-other");
    await join(page, "toast-timer-self");
    const toast = await sendPoke(page, "toast-timer-other");
    const shownAt = Date.now();
    await expect(toast).toBeHidden({ timeout: 7000 });
    // The app asks for 2800 ms (`showToast`); the window is wide because it is a measured duration.
    const shown = Date.now() - shownAt;
    expect(shown).toBeGreaterThan(2200);
    expect(shown).toBeLessThan(4500);
  });
});
