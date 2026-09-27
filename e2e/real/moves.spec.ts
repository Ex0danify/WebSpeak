import { GUEST_IDENTITY } from "./identities";
import { expect, test } from "./fixtures";
import { channelGroup, openMemberMenu, poll } from "../helpers";
import { channelIdOf, channelWith, menuAction, moveTarget } from "./ui";

// Moving another member through the member menu (step 5.5). What decides it is the server's own
// permissions: identities 0 to 3 are Server Admin, `GUEST_IDENTITY` is an ordinary guest (step 5.2b).

test("an administrator moves a guest to another channel from the member menu", async ({ person, testChannel, query }) => {
  const from = await testChannel("real-move-from");
  const to = await testChannel("real-move-to");
  const admin = await person(0, "move-admin");
  const guest = await person(GUEST_IDENTITY, "move-guest");
  await admin.join(from.name);
  await guest.join(from.name);
  await expect(channelWith(admin.page, from.name, 2)).toBeVisible();

  const menu = await openMemberMenu(admin.page, guest.nickname);
  await menuAction(menu, "Move to").click();
  await moveTarget(admin.page, to.name).click();

  await expect(admin.page.getByText("Member moved", { exact: true })).toBeVisible();
  await poll(() => channelIdOf(query, guest.nickname), (cid) => cid === to.id, { message: "the server to have moved the guest" });
  for (const { page } of [admin, guest]) {
    await expect(channelWith(page, from.name, 1)).toBeVisible();
    await expect(channelWith(page, to.name, 1)).toBeVisible();
  }
  await expect(channelGroup(guest.page, to.name).getByText(`${guest.nickname} (You)`, { exact: true })).toBeVisible();
});

test("a guest is refused, nobody moves, and the permission message is shown", async ({ person, testChannel, query }) => {
  const from = await testChannel("real-refuse-from");
  const to = await testChannel("real-refuse-to");
  const admin = await person(0, "refuse-admin");
  const guest = await person(GUEST_IDENTITY, "refuse-guest");
  await admin.join(from.name);
  await guest.join(from.name);
  await expect(channelWith(guest.page, from.name, 2)).toBeVisible();

  const menu = await openMemberMenu(guest.page, admin.nickname);
  await menuAction(menu, "Move to").click();
  await moveTarget(guest.page, to.name).click();

  await expect(guest.page.getByText("You do not have permission to perform this action", { exact: true })).toBeVisible();
  await expect(guest.page.getByText("Member moved", { exact: true })).toBeHidden();
  expect(await channelIdOf(query, admin.nickname)).toBe(from.id);
  await expect(channelWith(guest.page, from.name, 2)).toBeVisible();
  await expect(channelWith(guest.page, to.name, 0)).toBeVisible();
});
