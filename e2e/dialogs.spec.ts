import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectInRoom, memberRow, submitJoin } from "./helpers";

// The dialogs of the join flow and what a lost connection does to the form, against the real
// gateway and the fake TeamSpeak server. The fake server is shared by the tests of a worker, so a
// test that protects the server or a channel takes it back off.

const ROOM_A = 2n;

function joinTicketBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/join-ticket")) bodies.push(request.postDataJSON());
  });
  return bodies;
}

/**
 * Resolves once for each socket the page closes, in order: `await closes.next()` is "the next
 * socket has closed". Call it before the action that opens the socket.
 */
function socketCloses(page: Page): { next(): Promise<void> } {
  let closed = 0;
  let taken = 0;
  page.on("websocket", (socket) => socket.on("close", () => closed++));
  return {
    async next() {
      taken++;
      await expect.poll(() => closed, { message: `socket ${taken} closes` }).toBeGreaterThanOrEqual(taken);
    },
  };
}

test.describe("server password dialog", () => {
  test.beforeEach(({ gateway }) => {
    gateway.ts.serverPassword = "s3cret";
  });
  test.afterEach(({ gateway }) => {
    gateway.ts.serverPassword = "";
  });

  test("opens on a refusal, takes focus, and stays disabled until something is typed", async ({ page }) => {
    await submitJoin(page, "dlg-server-open");
    const dialog = page.getByRole("dialog", { name: "Server password required" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("This TeamSpeak server requires a password");
    const password = dialog.getByLabel("Enter server password");
    await expect(password).toBeFocused();
    const submit = dialog.getByRole("button", { name: "Enter password and retry" });
    await expect(submit).toBeDisabled();
    await password.fill("x");
    await expect(submit).toBeEnabled();
  });

  test("Enter sends a new ticket that carries the password, and the join succeeds", async ({ page }) => {
    const tickets = joinTicketBodies(page);
    await submitJoin(page, "dlg-server-right");
    const dialog = page.getByRole("dialog", { name: "Server password required" });
    await dialog.getByLabel("Enter server password").fill("s3cret");
    await page.keyboard.press("Enter");
    await expectInRoom(page, "dlg-server-right");
    await expect(dialog).toBeHidden();
    expect(tickets.map((ticket) => ticket.serverPassword ?? "")).toEqual(["", "s3cret"]);
  });

  test("a wrong password asks again and says it was rejected", async ({ page }) => {
    await submitJoin(page, "dlg-server-wrong");
    const dialog = page.getByRole("dialog", { name: "Server password required" });
    await dialog.getByLabel("Enter server password").fill("nope");
    await page.keyboard.press("Enter");
    await expect(dialog).toContainText("The server password was rejected");
    await expect(dialog.getByLabel("Enter server password")).toHaveValue("");
    await dialog.getByLabel("Enter server password").fill("s3cret");
    await page.keyboard.press("Enter");
    await expectInRoom(page, "dlg-server-wrong");
  });

  test("Esc and Cancel close it and leave the join form as it was", async ({ page }) => {
    // The gateway closes the socket right after it refuses the join. Cancel only sticks once that
    // close has been handled, so it is waited for: under load it can come a moment after the dialog.
    const refusedSocketClosed = socketCloses(page);
    await submitJoin(page, "dlg-server-cancel");
    const dialog = page.getByRole("dialog", { name: "Server password required" });
    await expect(dialog.getByLabel("Enter server password")).toBeFocused();
    await refusedSocketClosed.next();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Your nickname")).toHaveValue("dlg-server-cancel");
    await expect(page.getByRole("button", { name: "Enter voice space" })).toBeEnabled();
    // and the same for the Cancel button
    await page.getByRole("button", { name: "Enter voice space" }).click();
    await expect(dialog).toBeVisible();
    await refusedSocketClosed.next();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe("server password dialog: a close that arrives after Esc", () => {
  test.beforeEach(({ gateway }) => {
    gateway.ts.serverPassword = "s3cret";
  });
  test.afterEach(({ gateway }) => {
    gateway.ts.serverPassword = "";
  });

  // The gateway closes the socket right after it refuses the join, so the close is normally handled
  // before anyone can press a key. Here the close frame is held back until after Esc, the way a slow
  // network or a busy machine can deliver it, and then let through.
  async function cancelThenLetTheCloseThrough(page: Page, nickname: string) {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.routeWebSocket(/\/ws\/voice/, (ws) => {
      const server = ws.connectToServer();
      server.onClose(async (code, reason) => {
        await held;
        await ws.close({ code, reason });
      });
    });
    const closes = socketCloses(page);
    await submitJoin(page, nickname);
    const dialog = page.getByRole("dialog", { name: "Server password required" });
    await expect(dialog.getByLabel("Enter server password")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    release();
    await closes.next();
    // Let the page handle the close event (it runs in a later task than the frame's arrival).
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    return dialog;
  }

  test("F23: the close of the refused socket brings the dialog back after it was cancelled", async ({ page }) => {
    const dialog = await cancelThenLetTheCloseThrough(page, "dlg-late-close-pinned");
    await expect(dialog).toBeVisible();
  });

  test("a cancelled password dialog stays closed when the socket's close arrives late (bug F23)", async ({ page }) => {
    test.fail();
    const dialog = await cancelThenLetTheCloseThrough(page, "dlg-late-close-marker");
    await expect(dialog).toBeHidden({ timeout: 1500 });
  });
});

test.describe("channel password dialog", () => {
  test.beforeEach(({ gateway }) => {
    gateway.ts.channels.get(ROOM_A)!.password = "open-sesame";
  });
  test.afterEach(({ gateway }) => {
    delete gateway.ts.channels.get(ROOM_A)!.password;
  });

  async function askForRoomA(page: Page, nickname: string) {
    await submitJoin(page, nickname);
    await expectInRoom(page, nickname);
    await page.getByRole("button", { name: /^Room A/ }).click();
    const dialog = page.getByRole("dialog", { name: "Enter protected channel" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("a wrong password keeps it open with an error, the right one closes it and moves the member", async ({ page, gateway }) => {
    const dialog = await askForRoomA(page, "dlg-channel-pw");
    const password = dialog.getByLabel("Enter the channel password");
    await expect(password).toBeFocused();
    await password.fill("wrong");
    await page.keyboard.press("Enter");
    await expect(dialog).toContainText("That password was not accepted");
    await password.fill("open-sesame");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect.poll(() => {
      const self = [...gateway.ts.members.values()].find((member) => member.nickname === "dlg-channel-pw")!;
      return gateway.ts.channels.get(self.channelID)?.name;
    }).toBe("Room A");
  });

  test("Esc cancels: no move, and the member is still in the room", async ({ page, gateway }) => {
    const dialog = await askForRoomA(page, "dlg-channel-esc");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(memberRow(page, "dlg-channel-esc")).toBeVisible();
    const self = [...gateway.ts.members.values()].find((member) => member.nickname === "dlg-channel-esc")!;
    expect(self.channelID).toBe(gateway.ts.defaultChannelId);
  });
});

test.describe("QQ group dialog", () => {
  test("opens from the header, shows the code and the link, and Esc returns focus to the button", async ({ page }) => {
    await page.goto("/");
    const opener = page.getByRole("button", { name: "QQ group" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "QQ group" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img", { name: "QQ group QR code" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Join the QQ group" })).toHaveAttribute("href", /qm\.qq\.com/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});
