import { expect, test } from "./fixtures";
import { openMemberMenu } from "../helpers";
import { chatTab, menuAction, message, say } from "./ui";

// Text chat through the real server. What one browser sends is what the others receive, in the scope it was sent in. Three
// people where scope matters, the third must see nothing.

test("channel chat goes both ways and stays in the channel", async ({ person, testChannel }) => {
  const room = await testChannel("real-chat");
  const elsewhere = await testChannel("real-chat-apart");
  const alice = await person(0, "chat-alice");
  const bob = await person(1, "chat-bob");
  const carol = await person(2, "chat-carol");
  await alice.join(room.name);
  await bob.join(room.name);
  await carol.join(elsewhere.name);

  await say(alice.page, "hello bob");
  await expect(message(alice.page, "You", "hello bob")).toBeVisible();
  await expect(message(bob.page, alice.nickname, "hello bob")).toBeVisible();
  await say(bob.page, "hello alice");
  await expect(message(alice.page, bob.nickname, "hello alice")).toBeVisible();
  await expect(message(bob.page, "You", "hello alice")).toBeVisible();

  // Carol was there when both messages were delivered, so a message that were coming would have arrived.
  await expect(message(carol.page, alice.nickname, "hello bob")).toHaveCount(0);
  await expect(message(carol.page, bob.nickname, "hello alice")).toHaveCount(0);
});

test("server chat reaches people in other channels, on the tab of its own", async ({ person, testChannel }) => {
  const room = await testChannel("real-srv-chat");
  const elsewhere = await testChannel("real-srv-chat-apart");
  const alice = await person(0, "srv-alice");
  const bob = await person(1, "srv-bob");
  await alice.join(room.name);
  await bob.join(elsewhere.name);

  await chatTab(alice.page, "Server").click();
  await say(alice.page, "to everyone");
  await expect(message(alice.page, "You", "to everyone")).toBeVisible();
  await chatTab(bob.page, "Server").click();
  await expect(message(bob.page, alice.nickname, "to everyone")).toBeVisible();
  await chatTab(bob.page, elsewhere.name).click();
  await expect(message(bob.page, alice.nickname, "to everyone")).toBeHidden();
});

test("a private chat goes to one person, opens a tab for them, and the reply comes back", async ({ person, testChannel }) => {
  const room = await testChannel("real-pm");
  const alice = await person(0, "pm-alice");
  const bob = await person(1, "pm-bob");
  const carol = await person(2, "pm-carol");
  await alice.join(room.name);
  await bob.join(room.name);
  await carol.join(room.name);

  await menuAction(await openMemberMenu(alice.page, bob.nickname), "Private message").click();
  await say(alice.page, "just between us");
  await expect(message(alice.page, "You", "just between us")).toBeVisible();

  // The message opens a tab of its own for Alice, apart from the channel's.
  await expect(chatTab(bob.page, alice.nickname)).toBeVisible();
  await chatTab(bob.page, alice.nickname).click();
  await expect(message(bob.page, alice.nickname, "just between us")).toBeVisible();
  await say(bob.page, "understood");
  await expect(message(bob.page, "You", "understood")).toBeVisible();
  await expect(chatTab(alice.page, bob.nickname)).toBeVisible();
  await chatTab(alice.page, bob.nickname).click();
  await expect(message(alice.page, bob.nickname, "understood")).toBeVisible();

  // Carol shares the channel and the server, and got neither the message nor a tab.
  await expect(chatTab(carol.page, alice.nickname)).toHaveCount(0);
  await expect(message(carol.page, alice.nickname, "just between us")).toHaveCount(0);
});
