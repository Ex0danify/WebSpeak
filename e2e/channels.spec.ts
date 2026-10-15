import type { Locator, Page } from "@playwright/test";
import { expect, type Script, test } from "./fixtures";
import { channelGroup, channelHeading, join, memberRow } from "./helpers";
import type { FakeRemoteMember } from "../test/support/fakeTsClient";
import type { Gateway } from "../test/support/gateway";

// The channel tree and the voice cards of the connected view, on the real gateway and fake TeamSpeak server. The gateway is
// shared by a worker's tests, so every test builds its own channels (removed afterwards) and counts only the people it put
// there.

// Opus's own 20 ms silence frame. Its content does not matter to the tree; it has to be a valid packet
// so the browser's decoder has nothing to complain about.
const OPUS_SILENCE = Buffer.from([0xf8, 0xff, 0xfe]);

/** The colour of a channel's heading. The current channel is drawn in the accent colour, the others muted. */
async function headingColor(page: Page, channel: string): Promise<string> {
  return channelHeading(page, channel).evaluate((element) => getComputedStyle(element).color);
}

test.describe("channel tree", () => {
  test("lists every channel with the number of people in it", async ({ page, script }) => {
    const channel = script.channel("tree-list");
    script.channel("tree-list-empty");
    script.member("tree-list-a", channel);
    script.member("tree-list-b", channel);
    await join(page, "tree-list-self");

    await expect(channelHeading(page, "tree-list")).toContainText("2");
    await expect(channelGroup(page, "tree-list").getByText("tree-list-a")).toBeVisible();
    await expect(channelGroup(page, "tree-list").getByText("tree-list-b")).toBeVisible();
    // An empty channel shows no count and no empty-state line; screen readers still get "no members".
    await expect(channelHeading(page, "tree-list-empty")).not.toContainText(/\d/);
    await expect(channelGroup(page, "tree-list-empty").getByText("No members in this channel")).toBeAttached();
    // The channels the fake server always has are there too, and you are in the first of them.
    await expect(channelGroup(page, "Lobby").getByText("tree-list-self (You)")).toBeVisible();
  });

  test("counts follow members entering, moving and leaving", async ({ page, script }) => {
    const here = script.channel("tree-count-here");
    const there = script.channel("tree-count-there");
    await join(page, "tree-count-self");
    await expect(channelHeading(page, "tree-count-here")).toHaveAccessibleName("tree-count-here");

    const walker = script.member("tree-count-walker", here);
    await expect(channelHeading(page, "tree-count-here")).toHaveAccessibleName("tree-count-here 1");
    await expect(channelGroup(page, "tree-count-here").getByText("tree-count-walker")).toBeVisible();

    walker.moveTo(there);
    await expect(channelHeading(page, "tree-count-here")).toHaveAccessibleName("tree-count-here");
    await expect(channelHeading(page, "tree-count-there")).toHaveAccessibleName("tree-count-there 1");
    await expect(channelGroup(page, "tree-count-there").getByText("tree-count-walker")).toBeVisible();

    walker.leave();
    await expect(channelHeading(page, "tree-count-there")).toHaveAccessibleName("tree-count-there");
    await expect(memberRow(page, "tree-count-walker")).toBeHidden();
  });

  test("clicking a channel moves you there, under its heading", async ({ page, gateway, script }) => {
    script.channel("tree-click");
    await join(page, "tree-click-self");
    await channelHeading(page, "tree-click").click();

    await expect(channelGroup(page, "tree-click").getByText("tree-click-self (You)")).toBeVisible();
    await expect(channelGroup(page, "Lobby").getByText("tree-click-self (You)")).toBeHidden();
    const self = [...gateway.ts.members.values()].find((member) => member.nickname === "tree-click-self")!;
    expect(gateway.ts.channels.get(self.channelID)?.name).toBe("tree-click");
    await expect(channelHeading(page, "tree-click")).toHaveAccessibleName("tree-click 1");
  });

  test("the current channel is drawn apart from the others, and the highlight moves when you click another", async ({ page, script }) => {
    script.channel("tree-follow-other");
    await join(page, "tree-follow-self");
    await page.mouse.move(0, 0);

    const current = await headingColor(page, "Lobby");
    await expect.poll(() => headingColor(page, "tree-follow-other")).not.toBe(current);

    await channelHeading(page, "tree-follow-other").click();
    await expect(channelGroup(page, "tree-follow-other").getByText("tree-follow-self (You)")).toBeVisible();
    await page.mouse.move(0, 0);
    await expect.poll(() => headingColor(page, "tree-follow-other")).toBe(current);
    await expect.poll(() => headingColor(page, "Lobby")).not.toBe(current);
  });

  // Someone else (an administrator dragging you) moves you, and the view follows. The list, the highlight, the voice cards
  // and the channel chat tab all move with it.
  async function beMovedByAnother(page: Page, gateway: Gateway, script: Script, nickname: string) {
    const other = script.channel(`${nickname}-other`);
    script.member(`${nickname}-lobby-mate`);
    await join(page, nickname);
    await page.mouse.move(0, 0);
    const self = [...gateway.ts.members.values()].find((member) => member.nickname === nickname)!;
    const before = await headingColor(page, "Lobby");
    gateway.ts.moveMember(self.id, other);
    await expect(channelGroup(page, `${nickname}-other`).getByText(`${nickname} (You)`)).toBeVisible();
    return { before, otherName: `${nickname}-other` };
  }

  test("the highlight follows a move someone else made", async ({ page, gateway, script }) => {
    const { before, otherName } = await beMovedByAnother(page, gateway, script, "tree-moved-marker");
    await expect.poll(() => headingColor(page, otherName), { timeout: 2000 }).toBe(before);
    await expect.poll(() => headingColor(page, "Lobby"), { timeout: 2000 }).not.toBe(before);
  });

  test("the channel chat tab and the voice card count follow a move someone else made", async ({ page, gateway, script, isMobile }) => {
    const { otherName } = await beMovedByAnother(page, gateway, script, "tree-moved-chat");
    // The chat tab strip's channel tab is named after the current channel.
    if (!isMobile) {
      await expect(page.getByRole("tab", { name: otherName, exact: true })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Lobby", exact: true })).toBeHidden();
      await expect(page.getByText("1 online")).toBeVisible();
    }
    const chatTab = page.getByRole("tab", { name: "Chat" });
    if (await chatTab.isVisible()) await chatTab.click();
    await expect(page.getByRole("heading", { name: `${otherName} chat` })).toBeVisible();
  });
});

test.describe("speaking", () => {
  /** Sends frames until the browser shows the member as speaking, the first ones may arrive before the page listens. */
  async function speakUntilShown(remote: FakeRemoteMember, shown: Locator): Promise<void> {
    await expect(async () => {
      remote.speak(OPUS_SILENCE);
      await expect(shown).toBeVisible({ timeout: 250 });
    }).toPass({ timeout: 8000 });
  }

  test("a member whose audio arrives is shown as speaking in the list, and goes back to online when it stops", async ({ page, script }) => {
    const talker = script.member("speak-list-talker");
    await join(page, "speak-list-self");
    const row = memberRow(page, "speak-list-talker");
    await expect(row.getByText("Online")).toBeVisible();

    await speakUntilShown(talker, row.getByText("Speaking…"));
    // No more frames: the indicator holds a moment and then clears by itself.
    await expect(row.getByText("Online")).toBeVisible();
    await expect(row.getByText("Speaking…")).toBeHidden();
  });

  test("the voice section has a card for each person in your channel, and the speaker's card says so", async ({
    page,
    script,
    isMobile,
  }) => {
    const talker = script.member("speak-card-talker");
    script.member("speak-card-away", script.channel("speak-card-other"));
    await join(page, "speak-card-self");
    if (await page.getByRole("tab", { name: "Voice" }).isVisible()) await page.getByRole("tab", { name: "Voice" }).click();

    const card = (nickname: string) => page.getByRole("article").filter({ has: page.getByText(nickname, { exact: true }) });
    await expect(card("speak-card-talker")).toContainText("Connected");
    await expect(card("You")).toContainText("Connected · you");
    // Somebody in another channel has no card, and the counter is the people in yours.
    await expect(card("speak-card-away")).toHaveCount(0);
    // (The counter is not drawn on a phone.)
    if (!isMobile) await expect(page.getByText("2 online")).toBeVisible();

    await speakUntilShown(talker, card("speak-card-talker").getByText("Speaking…"));
    await expect(card("You")).not.toContainText("Speaking…");
    await expect(card("speak-card-talker")).not.toContainText("Speaking…");
  });
});

test.describe("member search", () => {
  test("keeps the channels whose name or members match, ignoring case and spaces around, and says so when none does", async ({
    page,
    script,
  }) => {
    const alpha = script.channel("search-chan-alpha");
    const beta = script.channel("search-chan-beta");
    script.member("zq-alpha", alpha);
    script.member("zq-beta", beta);
    await join(page, "search-self");
    const search = page.getByRole("textbox", { name: "Search members" });

    await search.fill("  ZQ-ALPHA ");
    await expect(channelHeading(page, "search-chan-alpha")).toBeVisible();
    await expect(channelHeading(page, "search-chan-beta")).toBeHidden();
    await expect(channelHeading(page, "Lobby")).toBeHidden();

    // A channel name matches too, and shows everyone in it.
    await search.fill("chan-beta");
    await expect(channelHeading(page, "search-chan-beta")).toBeVisible();
    await expect(channelGroup(page, "search-chan-beta").getByText("zq-beta")).toBeVisible();
    await expect(channelHeading(page, "search-chan-alpha")).toBeHidden();

    await search.fill("nobody-is-called-this");
    await expect(page.getByText("No matching members")).toBeVisible();
    await expect(channelHeading(page, "Lobby")).toBeHidden();

    await search.fill("");
    await expect(page.getByText("No matching members")).toBeHidden();
    await expect(channelHeading(page, "Lobby")).toBeVisible();
    await expect(channelHeading(page, "search-chan-alpha")).toBeVisible();
  });
});
