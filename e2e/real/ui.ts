import type { Locator, Page } from "@playwright/test";
import type { WebQuery } from "./server";

// Handles on the connected view that several real-server specs share. Same locators as the layer 4 specs (roles and visible
// text), kept here because the desktop project is the only one of layer 5, so there is no phone tab to open first.

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The button of a channel with `count` people in it, so a count that follows a move can be awaited. */
export const channelWith = (page: Page, channel: string, count: number): Locator =>
  page.getByRole("button", { name: `${channel} ${count}`, exact: true });

/** A tab of the chat panel (the channel's own, "Server", or a private chat named by the person). */
export const chatTab = (page: Page, name: string): Locator => page.getByRole("tab", { name, exact: true });

/** One message: its sender ("You" for your own) and its text. */
export const message = (page: Page, sender: string, text: string): Locator =>
  page
    .getByRole("article")
    .filter({ has: page.getByText(sender, { exact: true }) })
    .filter({ hasText: text });

export const composer = (page: Page): Locator => page.getByRole("textbox", { name: "Send" });

export async function say(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

/** An item of a member's menu (a popup on desktop). */
export const menuAction = (menu: Locator, name: string): Locator => menu.getByRole("menuitem", { name, exact: true });

/** A channel in the "Move to" submenu, a second popup outside the first, so it is looked for on the page. */
export const moveTarget = (page: Page, channel: string): Locator => page.getByRole("menuitem", { name: new RegExp(escapeRegExp(channel)) });

/** The id of the channel the server has this nickname in, `undefined` when it is not connected. */
export async function channelIdOf(query: WebQuery, nickname: string): Promise<string | undefined> {
  return (await query.call("clientlist")).find((client) => client.client_nickname === nickname)?.cid;
}

/** The server's client id of a nickname, the key of the gateway's per-source voice counters. */
export async function clientIdOf(query: WebQuery, nickname: string): Promise<string> {
  const row = (await query.call("clientlist")).find((client) => client.client_nickname === nickname);
  if (!row) throw new Error(`the server lists no client called "${nickname}"`);
  return row.clid;
}
