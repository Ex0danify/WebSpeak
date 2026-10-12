import { expect, test } from "./fixtures";
import { expectInRoom, poll } from "../helpers";
import { GUEST_IDENTITY } from "./identities";
import { channelIdOf, channelWith } from "./ui";

// Passwords on the real server. The dialogs themselves are layer 4, what only the real server shows is that its own refusals
// reach the person as the right dialog and that a right password gets them in. Rights don't matter here, so the guest identity
// is used throughout.

test.describe("server password", () => {
  test.beforeEach(async ({ query }) => {
    await query.call("serveredit", { virtualserver_password: "real-s3cret" });
  });
  test.afterEach(async ({ query }) => {
    await query.call("serveredit", { virtualserver_password: "" });
  });

  test("the server's refusal opens the dialog, a wrong password is refused again, the right one gets in", async ({ person, query }) => {
    const alice = await person(GUEST_IDENTITY, "pw-server");
    await alice.submit();
    const dialog = alice.page.getByRole("dialog", { name: "Server password required" });
    await expect(dialog).toContainText("This TeamSpeak server requires a password");
    expect(await channelIdOf(query, alice.nickname)).toBeUndefined();

    const password = dialog.getByLabel("Enter server password");
    await password.fill("not-the-password");
    await alice.page.keyboard.press("Enter");
    await expect(dialog).toContainText("The server password was rejected");
    await expect(password).toHaveValue("");
    expect(await channelIdOf(query, alice.nickname)).toBeUndefined();

    await password.fill("real-s3cret");
    await alice.page.keyboard.press("Enter");
    await expectInRoom(alice.page, alice.nickname);
    await expect(dialog).toBeHidden();
    await poll(
      () => channelIdOf(query, alice.nickname),
      (cid) => cid !== undefined,
      { message: "the server to list Alice after the right password" },
    );
  });
});

test("a protected channel asks for its password, refuses a wrong one and lets the right one in", async ({ person, testChannel, query }) => {
  const home = await testChannel("real-pw-home");
  const vault = await testChannel("real-pw-vault");
  await query.call("channeledit", { cid: vault.id, channel_password: "open-sesame" });
  const alice = await person(GUEST_IDENTITY, "pw-channel");
  await alice.join(home.name);
  await expect(channelWith(alice.page, vault.name, 0)).toBeVisible();

  await alice.page.getByRole("button", { name: `${vault.name} 0`, exact: true }).click();
  const dialog = alice.page.getByRole("dialog", { name: "Enter protected channel" });
  const password = dialog.getByLabel("Enter the channel password");
  await password.fill("wrong");
  await alice.page.keyboard.press("Enter");
  await expect(dialog).toContainText("That password was not accepted");
  // The dialog hides the page behind it, so the tree is only looked at again once it is closed.
  expect(await channelIdOf(query, alice.nickname)).toBe(home.id);

  await password.fill("open-sesame");
  await alice.page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await poll(
    () => channelIdOf(query, alice.nickname),
    (cid) => cid === vault.id,
    { message: "the server to move Alice into the protected channel" },
  );
  await expect(channelWith(alice.page, vault.name, 1)).toBeVisible();
  await expect(channelWith(alice.page, home.name, 0)).toBeVisible();
});
