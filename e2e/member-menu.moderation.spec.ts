import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { join, memberRow, openMemberMenu, poll } from "./helpers";
import { moderationLog } from "../test/support/fakeTsFiles";
import type { Gateway } from "../test/support/gateway";

// Kick, ban and groups in the menu of a member, on the real gateway and the fake TeamSpeak server. Moving others and
// moderating share one right in the fake server, `script.allowMoves()` gives it to the session.

const SERVER_GROUPS = [
  { id: 6, name: "Server Admin", isDefault: false, type: 1, sortId: 0, iconId: 300 },
  { id: 7, name: "Normal", isDefault: false, type: 1, sortId: 1, iconId: 600 },
  { id: 8, name: "Guest", isDefault: true, type: 1, sortId: 2, iconId: 0 },
  { id: 2, name: "Query", isDefault: false, type: 2, sortId: 3, iconId: 0 },
];
const CHANNEL_GROUPS = [
  { id: 6, name: "Operator", isDefault: false, type: 1, sortId: 0, iconId: 200 },
  { id: 8, name: "Channel Guest", isDefault: true, type: 1, sortId: 1, iconId: 0 },
];

function provideGroups(gateway: Gateway) {
  gateway.ts.groups.server = SERVER_GROUPS;
  gateway.ts.groups.channel = CHANNEL_GROUPS;
}

/** An entry of the menu: an item of the popup, a toggle or button of the sheet. */
function action(menu: Locator, name: string): Locator {
  return menu.getByRole("menuitem", { name, exact: true }).or(menu.getByRole("button", { name, exact: true }));
}

/** An entry of a group list. The popup's submenu is a second menu outside the first, the sheet expands in place. */
function groupItem(page: Page, menu: Locator, name: string): Locator {
  return page
    .getByRole("menuitemcheckbox", { name, exact: true })
    .or(page.getByRole("menuitem", { name, exact: true }))
    .or(menu.getByRole("button", { name, exact: true }));
}

/** Whether a server group is ticked: the popup's item is a checkbox, the sheet's a toggle button. */
const ticked = (item: Locator) => item.evaluate((element) => element.getAttribute("aria-checked") ?? element.getAttribute("aria-pressed"));

/** What the fake server was asked to do to others by this session, in order. */
const asked = (gateway: Gateway, nickname: string) =>
  moderationLog(gateway.ts.created.find((client) => client.options.nickname === nickname)!);

test.describe("the moderation of a member", () => {
  test("offers the groups as two submenus and kick and ban at the very bottom", async ({ page, script }) => {
    script.member("mod-list-other");
    await join(page, "mod-list-self");
    const menu = await openMemberMenu(page, "mod-list-other");

    await expect(action(menu, "Server groups")).toBeVisible();
    await expect(action(menu, "Channel group")).toBeVisible();
    const names = (await menu.locator('[role="menuitem"], button').allInnerTexts())
      .map((name) => name.trim())
      .filter((name) => name !== "Close");
    expect(names.slice(-3)).toEqual(["Kick from channel", "Kick from server", "Ban from server"]);
    expect(names.indexOf("Server groups")).toBeLessThan(names.indexOf("Kick from channel"));
    expect(names.indexOf("Channel group")).toBeLessThan(names.indexOf("Kick from channel"));
  });

  test("your own menu has the group submenus and nothing to kick or ban", async ({ page, isMobile }) => {
    await join(page, "mod-own");
    const row = memberRow(page, "mod-own");
    if (isMobile) await row.dispatchEvent("contextmenu");
    else await row.click({ button: "right" });
    const menu = page.getByRole(isMobile ? "dialog" : "menu", { name: "mod-own" });
    await expect(action(menu, "Server groups")).toBeVisible();
    await expect(action(menu, "Channel group")).toBeVisible();
    for (const name of ["Kick from channel", "Kick from server", "Ban from server"]) await expect(action(menu, name)).toHaveCount(0);
  });

  for (const [item, scope, title, told] of [
    ["Kick from channel", "channel", "Kick mod-kick-ch-other from the channel", "mod-kick-ch-other was kicked from the channel"],
    ["Kick from server", "server", "Kick mod-kick-sv-other from the server", "mod-kick-sv-other was kicked from the server"],
  ] as const) {
    test(`${item} asks for a reason, kicks, and says it was done`, async ({ page, gateway, script }) => {
      const nickname = title.split(" ")[1]!;
      script.allowMoves();
      const target = script.member(nickname);
      await join(page, `${nickname}-self`);
      await action(await openMemberMenu(page, nickname), item).click();
      const dialog = page.getByRole("dialog", { name: title });
      await dialog.getByLabel("Reason (optional)").fill("calm down");
      await dialog.getByRole("button", { name: "Kick", exact: true }).click();
      await expect(page.getByText(told, { exact: true })).toBeVisible();
      expect(
        await poll(
          () => asked(gateway, `${nickname}-self`),
          (log) => log.length > 0,
        ),
      ).toEqual([{ action: "kick", clientId: target.id, scope, reason: "calm down" }]);
    });
  }

  test("cancelling the kick sends nothing", async ({ page, gateway, script }) => {
    script.allowMoves();
    script.member("mod-kick-cancel-other");
    await join(page, "mod-kick-cancel-self");
    await action(await openMemberMenu(page, "mod-kick-cancel-other"), "Kick from server").click();
    const dialog = page.getByRole("dialog", { name: "Kick mod-kick-cancel-other from the server" });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(asked(gateway, "mod-kick-cancel-self")).toEqual([]);
  });

  test("a ban asks for a reason and a length, a day by default, and says it was done", async ({ page, gateway, script }) => {
    script.allowMoves();
    script.member("mod-ban-other");
    await join(page, "mod-ban-self");
    await action(await openMemberMenu(page, "mod-ban-other"), "Ban from server").click();
    const dialog = page.getByRole("dialog", { name: "Ban mod-ban-other" });
    await expect(dialog.getByRole("combobox", { name: "Duration" })).toContainText("1 day");
    await dialog.getByLabel("Reason (optional)").fill("spam");
    await dialog.getByRole("button", { name: "Ban", exact: true }).click();
    await expect(page.getByText("mod-ban-other was banned", { exact: true })).toBeVisible();
    expect(
      await poll(
        () => asked(gateway, "mod-ban-self"),
        (log) => log.length > 0,
      ),
    ).toEqual([{ action: "ban", uid: "remote-mod-ban-other", seconds: 86400, reason: "spam" }]);
  });

  test("a ban takes a custom length in minutes, and refuses one that is not a whole number", async ({ page, gateway, script }) => {
    script.allowMoves();
    script.member("mod-ban-custom-other");
    await join(page, "mod-ban-custom-self");
    await action(await openMemberMenu(page, "mod-ban-custom-other"), "Ban from server").click();
    const dialog = page.getByRole("dialog", { name: "Ban mod-ban-custom-other" });
    await dialog.getByRole("combobox", { name: "Duration" }).click();
    await page.getByRole("option", { name: "Custom" }).click();
    await dialog.getByRole("combobox", { name: "Unit" }).click();
    await page.getByRole("option", { name: "Minutes" }).click();

    await dialog.getByLabel("Length").fill("0");
    await expect(dialog.getByText(/whole number/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Ban", exact: true })).toBeDisabled();

    await dialog.getByLabel("Length").fill("90");
    await dialog.getByRole("button", { name: "Ban", exact: true }).click();
    expect(
      await poll(
        () => asked(gateway, "mod-ban-custom-self"),
        (log) => log.length > 0,
      ),
    ).toEqual([{ action: "ban", uid: "remote-mod-ban-custom-other", seconds: 5400, reason: "" }]);
  });

  test("a permanent ban is sent as 0 seconds", async ({ page, gateway, script }) => {
    script.allowMoves();
    script.member("mod-ban-forever-other");
    await join(page, "mod-ban-forever-self");
    await action(await openMemberMenu(page, "mod-ban-forever-other"), "Ban from server").click();
    const dialog = page.getByRole("dialog", { name: "Ban mod-ban-forever-other" });
    await dialog.getByRole("combobox", { name: "Duration" }).click();
    await page.getByRole("option", { name: "Permanent" }).click();
    await dialog.getByRole("button", { name: "Ban", exact: true }).click();
    expect(
      await poll(
        () => asked(gateway, "mod-ban-forever-self"),
        (log) => log.length > 0,
      ),
    ).toMatchObject([{ action: "ban", seconds: 0 }]);
  });

  test("a guest is refused, shown the reason, and nothing happens", async ({ page, gateway, script }) => {
    script.member("mod-refused-other");
    await join(page, "mod-refused-self");
    await action(await openMemberMenu(page, "mod-refused-other"), "Kick from server").click();
    await page
      .getByRole("dialog", { name: "Kick mod-refused-other from the server" })
      .getByRole("button", { name: "Kick", exact: true })
      .click();
    await expect(page.getByText("You do not have permission to perform this action", { exact: true })).toBeVisible();
    await expect(page.getByText(/was kicked/)).toBeHidden();
    expect(asked(gateway, "mod-refused-self")).toEqual([]);
  });
});

test.describe("the groups of a member", () => {
  test("lists the regular groups, ticks the ones the member has, and gives and takes a server group", async ({ page, gateway, script }) => {
    provideGroups(gateway);
    script.allowMoves();
    const target = script.member("mod-groups-other");
    gateway.ts.updateMember(target.id, { serverGroups: ["7", "8"] });
    await join(page, "mod-groups-self");
    const menu = await openMemberMenu(page, "mod-groups-other");
    await action(menu, "Server groups").click();

    // The default and the query group are not ones to hand out.
    await expect(groupItem(page, menu, "Guest")).toHaveCount(0);
    await expect(groupItem(page, menu, "Query")).toHaveCount(0);
    const normal = groupItem(page, menu, "Normal");
    await expect(normal).toBeVisible();
    await expect.poll(() => ticked(normal)).toBe("true");
    await expect.poll(() => ticked(groupItem(page, menu, "Server Admin"))).toBe("false");

    await groupItem(page, menu, "Server Admin").click();
    await expect(page.getByText("mod-groups-other was added to Server Admin", { exact: true })).toBeVisible();
    const databaseId = BigInt(target.id) + 1000n;
    expect(
      await poll(
        () => asked(gateway, "mod-groups-self"),
        (log) => log.length > 0,
      ),
    ).toEqual([{ action: "serverGroup", groupId: 6, databaseId, assigned: true }]);

    const again = await openMemberMenu(page, "mod-groups-other");
    await action(again, "Server groups").click();
    await groupItem(page, again, "Normal").click();
    await expect(page.getByText("mod-groups-other was removed from Normal", { exact: true })).toBeVisible();
    expect(asked(gateway, "mod-groups-self").at(-1)).toEqual({ action: "serverGroup", groupId: 7, databaseId, assigned: false });
  });

  test("sets a channel group, marks the one in effect, and gives the default group back when it is chosen again", async ({
    page,
    gateway,
    script,
  }) => {
    provideGroups(gateway);
    script.allowMoves();
    const target = script.member("mod-channel-other");
    gateway.ts.updateMember(target.id, { channelGroupId: 6 });
    await join(page, "mod-channel-self");
    const menu = await openMemberMenu(page, "mod-channel-other");
    await action(menu, "Channel group").click();

    await expect(groupItem(page, menu, "Channel Guest")).toHaveCount(0);
    const operator = groupItem(page, menu, "Operator");
    await expect(operator).toHaveAttribute("aria-current", "true");
    await operator.click();

    await expect(page.getByText("mod-channel-other is now Channel Guest in this channel", { exact: true })).toBeVisible();
    expect(
      await poll(
        () => asked(gateway, "mod-channel-self"),
        (log) => log.length > 0,
      ),
    ).toMatchObject([{ action: "channelGroup", groupId: 8, channelId: expect.anything() }]);
  });

  test("a guest is refused a group change, and told why", async ({ page, gateway, script }) => {
    provideGroups(gateway);
    script.member("mod-groups-refused-other");
    await join(page, "mod-groups-refused-self");
    const menu = await openMemberMenu(page, "mod-groups-refused-other");
    await action(menu, "Server groups").click();
    await groupItem(page, menu, "Normal").click();
    await expect(page.getByText("You do not have permission to perform this action", { exact: true })).toBeVisible();
    expect(asked(gateway, "mod-groups-refused-self")).toEqual([]);
  });

  test("your own menu changes your own groups", async ({ page, gateway, script, isMobile }) => {
    provideGroups(gateway);
    script.allowMoves();
    await join(page, "mod-groups-own");
    const row = memberRow(page, "mod-groups-own");
    if (isMobile) await row.dispatchEvent("contextmenu");
    else await row.click({ button: "right" });
    const menu = page.getByRole(isMobile ? "dialog" : "menu", { name: "mod-groups-own" });
    await action(menu, "Server groups").click();
    await groupItem(page, menu, "Normal").click();
    await expect(page.getByText("mod-groups-own was added to Normal", { exact: true })).toBeVisible();
    expect(asked(gateway, "mod-groups-own")).toMatchObject([{ action: "serverGroup", groupId: 7, assigned: true }]);
  });
});
