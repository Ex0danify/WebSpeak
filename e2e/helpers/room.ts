import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Fills the join form and submits it, with a target channel when one is given. Does not wait for the room, a test of a failed
 * join calls this and a normal one follows with `expectInRoom`.
 */
export async function submitJoin(page: Page, nickname: string, channel?: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Your nickname").fill(nickname);
  if (channel !== undefined) await page.getByLabel(/Target channel/).fill(channel);
  await page.getByRole("button", { name: "Enter voice space" }).click();
}

/** Joins and waits until the connected view shows this nickname among the members. */
export async function join(page: Page, nickname: string): Promise<void> {
  await submitJoin(page, nickname);
  await expectInRoom(page, nickname);
}

/**
 * The connected view, meaning the member list is there and has the nickname. The list is on screen on desktop and on the
 * phone's first tab, so this holds for both, unlike the header's Exit, which sits in the phone's "More" tab.
 */
export async function expectInRoom(page: Page, nickname: string): Promise<void> {
  await expect(page.getByRole("textbox", { name: "Search members" })).toBeVisible();
  await expect(memberRow(page, nickname)).toBeVisible();
}

/**
 * One row of the member list. A row has no role or label, so it is the innermost block that holds the nickname and the
 * member-states group. Your own row reads "nickname (You)". Nicknames are unique per test.
 */
export function memberRow(page: Page, nickname: string): Locator {
  return page
    .locator("div")
    .filter({ has: page.getByText(new RegExp(`^${nickname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( \\(You\\))?$`)) })
    .filter({ has: page.getByLabel("Member states") })
    .last();
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The button of one channel in the member tree, named by the channel and the number of people in it. */
export function channelHeading(page: Page, channel: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^${escapeRegExp(channel)} \\d+$`) });
}

/** One channel of the member tree with the members listed under it (the block that holds its heading). */
export function channelGroup(page: Page, channel: string): Locator {
  return page.locator("section").filter({ has: channelHeading(page, channel) });
}

/**
 * Opens another member's menu the way the viewport does it, a right click on desktop and the "..." button of the row on a
 * phone. Returns the opened menu or sheet.
 */
export async function openMemberMenu(page: Page, nickname: string): Promise<Locator> {
  const row = memberRow(page, nickname);
  if (page.viewportSize() && (await page.evaluate(() => matchMedia("(pointer: coarse)").matches))) {
    await row.getByRole("button", { name: "More member options" }).click();
  } else {
    await row.click({ button: "right" });
  }
  const menu = page.getByRole("menu").or(page.getByRole("dialog", { name: nickname }));
  await expect(menu.first()).toBeVisible();
  return menu.first();
}
