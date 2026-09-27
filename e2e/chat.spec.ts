import type { Locator, Page } from "@playwright/test";
import { expect, type Script, test } from "./fixtures";
import { join, openMemberMenu, overflowScan, poll } from "./helpers";
import type { Gateway } from "../test/helpers/gateway";

// The chat panel of the connected view: the channel, server and private tabs, the event log and the
// composer. Real gateway, fake TeamSpeak server. A message another person sends comes from a scripted
// member (`script`); what the browser sends is read from the fake client's record of it.

/** The chat is the whole right side on desktop and one of four tabs on a phone. */
async function openChat(page: Page): Promise<void> {
  const tab = page.getByRole("tab", { name: "Chat" });
  if (await tab.isVisible()) await tab.click();
}

/** One tab of the chat panel (channel, server, a private conversation, or the event log). */
const chatTab = (page: Page, name: string | RegExp): Locator => page.getByRole("tab", { name, exact: typeof name === "string" });

/** One message: its sender, and the text. Nothing else in the page is an article with both. */
const message = (page: Page, sender: string, text: string | RegExp): Locator =>
  page.getByRole("article").filter({ has: page.getByText(sender, { exact: true }) }).filter({ hasText: text });

const composer = (page: Page): Locator => page.getByRole("textbox", { name: "Send" });
const sendButton = (page: Page): Locator => page.getByRole("button", { name: "Send", exact: true });

/** What the browser has sent to TeamSpeak so far. */
function sentBy(gateway: Gateway, nickname: string) {
  return gateway.ts.created.find((client) => client.options.nickname === nickname)!.sentMessages;
}

function idOf(gateway: Gateway, nickname: string): number {
  return [...gateway.ts.members.values()].find((member) => member.nickname === nickname)!.id;
}

test.describe("channel chat", () => {
  test("a message you send shows as yours, empties the box and reaches the channel", async ({ page, gateway }) => {
    await join(page, "chat-send-self");
    await openChat(page);
    await expect(page.getByText("This is the beginning of the chat")).toBeVisible();

    await composer(page).fill("hello channel");
    await composer(page).press("Enter");
    await expect(message(page, "You", "hello channel")).toBeVisible();
    await expect(composer(page)).toHaveValue("");
    await expect(page.getByText("This is the beginning of the chat")).toBeHidden();
    const sent = await poll(() => sentBy(gateway, "chat-send-self"), (messages) => messages.length > 0);
    expect(sent).toEqual([expect.objectContaining({ scope: "channel", message: "hello channel" })]);
  });

  test("Send waits for text, ignores spaces around it, and the box stops at 500 characters", async ({ page, gateway }) => {
    await join(page, "chat-limit-self");
    await openChat(page);
    await expect(sendButton(page)).toBeDisabled();
    await composer(page).fill("   ");
    await expect(sendButton(page)).toBeDisabled();

    await composer(page).fill("  padded  ");
    await expect(sendButton(page)).toBeEnabled();
    await sendButton(page).click();
    await expect(message(page, "You", "padded")).toBeVisible();
    const sent = await poll(() => sentBy(gateway, "chat-limit-self"), (messages) => messages.length > 0);
    expect(sent[0].message).toBe("padded");

    await composer(page).fill("x".repeat(600));
    await expect(composer(page)).toHaveValue("x".repeat(500));
  });

  test("a message from someone in your channel shows with their name", async ({ page, script }) => {
    const other = script.member("chat-in-other");
    await join(page, "chat-in-self");
    await openChat(page);
    other.say("channel", "hi from the channel");
    await expect(message(page, "chat-in-other", "hi from the channel")).toBeVisible();
    await expect(page.getByText("This is the beginning of the chat")).toBeHidden();
  });

  test("a long link without spaces stays inside the panel", async ({ page, script }) => {
    const other = script.member("chat-link-other");
    await join(page, "chat-link-self");
    await openChat(page);
    const link = `https://example.com/${"a".repeat(300)}`;
    other.say("channel", link);
    const shown = message(page, "chat-link-other", "https://example.com/");
    await expect(shown).toBeVisible();
    expect(await overflowScan(page)).toEqual({ clipped: [], pageScrolls: false });
    // The bubble holds the whole link: it wraps, it is not cut.
    const box = await shown.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test("the list scrolls to the newest message", async ({ page, script }) => {
    const other = script.member("chat-scroll-other");
    await join(page, "chat-scroll-self");
    await openChat(page);
    for (let i = 1; i <= 30; i++) other.say("channel", `scroll line ${i}`);
    await expect(message(page, "chat-scroll-other", "scroll line 30")).toBeInViewport();
    await expect(message(page, "chat-scroll-other", /^scroll line 1$/)).not.toBeInViewport();
  });
});

test.describe("server chat", () => {
  test("has its own tab: what you send goes to the server, what arrives there stays out of the channel", async ({ page, gateway, script }) => {
    const other = script.member("srv-other");
    await join(page, "srv-self");
    await openChat(page);
    await chatTab(page, "Server").click();
    await expect(page.getByText("This is the beginning of the chat")).toBeVisible();

    await composer(page).fill("to the whole server");
    await sendButton(page).click();
    await expect(message(page, "You", "to the whole server")).toBeVisible();
    other.say("server", "server announcement");
    await expect(message(page, "srv-other", "server announcement")).toBeVisible();
    const sent = await poll(() => sentBy(gateway, "srv-self"), (messages) => messages.length > 0);
    expect(sent).toEqual([expect.objectContaining({ scope: "server", message: "to the whole server" })]);

    await chatTab(page, "Lobby").click();
    await expect(message(page, "You", "to the whole server")).toBeHidden();
    await expect(message(page, "srv-other", "server announcement")).toBeHidden();
  });
});

test.describe("private chat", () => {
  test("the member menu opens a private chat, and what you send goes to that person only", async ({ page, gateway, script, isMobile }) => {
    const other = script.member("pm-other");
    await join(page, "pm-self");
    await (await openMemberMenu(page, "pm-other")).getByText("Private message", { exact: true }).click();
    // On a phone the menu also switches to the chat tab. A conversation gets its tab with its first message.
    if (!isMobile) await openChat(page);
    await expect(page.getByText("This is the beginning of the private chat")).toBeVisible();

    await composer(page).fill("just between us");
    await sendButton(page).click();
    await expect(message(page, "You", "just between us")).toBeVisible();
    await expect(chatTab(page, "pm-other")).toBeVisible();
    await expect(page.getByRole("heading", { name: "pm-other" })).toBeVisible();
    const sent = await poll(() => sentBy(gateway, "pm-self"), (messages) => messages.length > 0);
    expect(sent).toEqual([expect.objectContaining({ scope: "private", message: "just between us", targetId: BigInt(other.id) })]);

    await chatTab(page, "Lobby").click();
    await expect(message(page, "You", "just between us")).toBeHidden();
  });

  // A private chat that was just opened has no message yet, and the title is taken from the member list.
  async function openEmptyPrivateChat(page: Page, script: Script, isMobile: boolean, nickname: string) {
    script.member(`${nickname}-other`);
    await join(page, nickname);
    await (await openMemberMenu(page, `${nickname}-other`)).getByText("Private message", { exact: true }).click();
    if (!isMobile) await openChat(page);
    await expect(page.getByText("This is the beginning of the private chat")).toBeVisible();
  }

  test("a private chat is titled with the person from the moment it opens, with a tab of its own (F25)", async ({ page, script, isMobile }) => {
    await openEmptyPrivateChat(page, script, isMobile, "pm-title-marker");
    await expect(page.getByRole("heading", { name: "pm-title-marker-other" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Private message" })).toBeHidden();
    await expect(chatTab(page, "pm-title-marker-other")).toBeVisible();
  });

  test("a private message from someone opens a tab of its own, apart from the channel", async ({ page, gateway, script }) => {
    const other = script.member("pm-in-other");
    await join(page, "pm-in-self");
    await openChat(page);
    other.say("private", "psst", BigInt(idOf(gateway, "pm-in-self")));

    await expect(chatTab(page, "pm-in-other")).toBeVisible();
    await expect(message(page, "pm-in-other", "psst")).toBeHidden();
    await chatTab(page, "pm-in-other").click();
    await expect(message(page, "pm-in-other", "psst")).toBeVisible();
    await chatTab(page, "Lobby").click();
    await expect(message(page, "pm-in-other", "psst")).toBeHidden();
  });
});

test.describe("event log", () => {
  /** The entries of the log: articles with a time, which no message or card has. */
  const entries = (page: Page): Locator => page.getByRole("article").filter({ has: page.locator("time") });

  test("starts with the connection, lists members coming and going, and has no composer", async ({ page, script, isMobile }) => {
    await join(page, "evt-self");
    await openChat(page);
    await chatTab(page, "Event log").click();
    await expect(entries(page)).toHaveCount(1);
    if (!isMobile) await expect(page.getByText("1 events")).toBeVisible();
    await expect(composer(page)).toHaveCount(0);

    const visitor = script.member("evt-visitor");
    await expect(entries(page).filter({ hasText: "evt-visitor" })).toHaveCount(1);
    visitor.leave();
    await expect(entries(page).filter({ hasText: "evt-visitor" })).toHaveCount(2);
    await expect(entries(page)).toHaveCount(3);
    if (!isMobile) await expect(page.getByText("3 events")).toBeVisible();
  });

  // The gateway now sends the kind and the nickname; the client builds the sentence itself with
  // t(), in the page's own language (F24). `message`, the Chinese text the gateway also sends,
  // stays only as a fallback for an older gateway and is never shown while a translation exists.
  test("F24: the entries follow the language of the page", async ({ page, script }) => {
    await join(page, "evt-en-self");
    await openChat(page);
    await chatTab(page, "Event log").click();
    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page).first()).toContainText("Connected to the server");
    await expect(entries(page).first()).not.toContainText(/[\u4e00-\u9fff]/);

    const visitor = script.member("evt-en-visitor");
    await expect(entries(page).filter({ hasText: "evt-en-visitor joined the server" })).toHaveCount(1);
    visitor.leave();
    await expect(entries(page).filter({ hasText: "evt-en-visitor left the server" })).toHaveCount(1);
  });

  test("F24: a member who changes channel is announced too, with a translated sentence", async ({ page, script, gateway }) => {
    const visitor = script.member("evt-en-mover");
    await join(page, "evt-en-mover-self");
    await openChat(page);
    await chatTab(page, "Event log").click();
    const roomB = [...gateway.ts.channels.values()].find((channel) => channel.name === "Room B")!.id;
    visitor.moveTo(roomB);
    await expect(entries(page).filter({ hasText: "evt-en-mover moved to another channel" })).toHaveCount(1);
  });
});
