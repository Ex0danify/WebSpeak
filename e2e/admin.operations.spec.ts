import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { overflowScan } from "./helpers";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../test/helpers/gateway";

// The admin console's Operations page: the live sessions, the invite links, and the pages at a
// phone's width. Each test has a gateway of its own (`ownGateway`), the console is asked for English.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("webspeak:language", "en"));
});

/** Signs in and opens the given admin page. */
async function openAdmin(page: Page, gateway: Gateway, path: "" | "/server" | "/operations"): Promise<void> {
  await page.goto(`${gateway.url}/admin/login`);
  await page.getByLabel("Admin username").fill("admin");
  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  if (path) await page.goto(`${gateway.url}/admin${path}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** A guest in another tab of the same browser, on the gateway's own guest page. */
async function guestJoins(page: Page, gateway: Gateway, nickname: string, link = ""): Promise<Page> {
  const guest = await page.context().newPage();
  await guest.goto(link || gateway.url);
  await guest.getByLabel("Your nickname").fill(nickname);
  await guest.getByRole("button", { name: "Enter voice space" }).click();
  return guest;
}

const sessionsTable = (page: Page) => page.locator("table").first();

test.describe("sessions", () => {
  test("says when nobody is connected, lists a guest with its state, and Refresh picks up a new one", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/operations");
    await expect(page.getByText("There are no active sessions.")).toBeVisible();

    const guest = await guestJoins(page, gateway, "ops-guest");
    await expect(guest.getByRole("textbox", { name: "Search members" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh" }).click();
    const row = sessionsTable(page).getByRole("row").filter({ hasText: "ops-guest" });
    await expect(row).toContainText("Connected");
    await expect(row).toContainText("127.0.0.1:9987");
    await expect(page.getByText("There are no active sessions.")).toBeHidden();
  });

  test("Terminate ends the guest's session: the guest is back at the form and the list is empty again", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    const guest = await guestJoins(page, gateway, "ops-victim");
    await expect(guest.getByRole("textbox", { name: "Search members" })).toBeVisible();
    await openAdmin(page, gateway, "/operations");
    page.on("dialog", (dialog) => dialog.accept());

    await sessionsTable(page).getByRole("row").filter({ hasText: "ops-victim" }).getByRole("button", { name: "Terminate" }).click();
    await expect(guest.getByRole("button", { name: "Enter voice space" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("There are no active sessions.")).toBeVisible();
  });
});

test.describe("invites", () => {
  test("creating one shows its link once, and lists it as active and unused", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/operations");
    await page.getByLabel("Target channel").fill("Room A");
    await page.getByRole("button", { name: "Create invite link" }).click();

    await expect(page.getByText("Copy and share it now. For security, the full token will not be shown again.")).toBeVisible();
    await expect(page.getByLabel("Invite link created")).toHaveValue(new RegExp(`^${gateway.url}/\\?invite=[\\w-]+$`));
    const item = page.locator(".invite-row").filter({ hasText: "Room A" });
    await expect(item).toContainText("Active");
    await expect(item).toContainText("0/∞");
  });

  test("the link takes a guest into the invite's channel and uses one up; Copy link copies it", async ({ page, context, ownGateway }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/operations");
    await page.getByLabel("Target channel").fill("Room A");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const link = await page.getByLabel("Invite link created").inputValue();

    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Invite link copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

    const guest = await guestJoins(page, gateway, "ops-invited", link);
    await expect(guest.getByRole("textbox", { name: "Search members" })).toBeVisible();
    const member = [...gateway.ts.members.values()].find((candidate) => candidate.nickname === "ops-invited")!;
    expect(gateway.ts.channels.get(member.channelID)?.name).toBe("Room A");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.locator(".invite-row").filter({ hasText: "Room A" })).toContainText("1/∞");
  });

  test("Revoke asks first, and a revoked link no longer lets a guest in", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/operations");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const link = await page.getByLabel("Invite link created").inputValue();
    const item = page.locator(".invite-row").first();
    await expect(item).toContainText("Active");

    let asked = "";
    page.once("dialog", (dialog) => {
      asked = dialog.message();
      return dialog.dismiss();
    });
    await item.getByRole("button", { name: "Revoke" }).click();
    await expect.poll(() => asked).toBe("Revoke this invite link?");
    await expect(item).toContainText("Active");

    page.once("dialog", (dialog) => dialog.accept());
    await item.getByRole("button", { name: "Revoke" }).click();
    await expect(item).toContainText("Revoked");
    await expect(item.getByRole("button", { name: "Revoke" })).toHaveCount(0);

    const guest = await guestJoins(page, gateway, "ops-late", link);
    await expect(guest.getByText("The invite link is invalid, expired, or revoked")).toBeVisible();
  });
});

// The console has the words "Session terminated." and "Invite link revoked." and never shows them
// (bug F30): the list changes and that is all.
test.describe("confirmations", () => {
  async function terminateAndRevoke(page: Page, gateway: Gateway) {
    const guest = await guestJoins(page, gateway, "ops-notice");
    await expect(guest.getByRole("textbox", { name: "Search members" })).toBeVisible();
    await openAdmin(page, gateway, "/operations");
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Create invite link" }).click();
    const item = page.locator(".invite-row").first();
    await item.getByRole("button", { name: "Revoke" }).click();
    await expect(item).toContainText("Revoked");
    await sessionsTable(page).getByRole("row").filter({ hasText: "ops-notice" }).getByRole("button", { name: "Terminate" }).click();
    await expect(guest.getByRole("button", { name: "Enter voice space" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("There are no active sessions.")).toBeVisible();
  }

  test("F30: terminating a session and revoking an invite change the lists and say nothing", async ({ page, ownGateway }) => {
    await terminateAndRevoke(page, await ownGateway());
    await expect(page.getByText("Session terminated.")).toHaveCount(0);
    await expect(page.getByText("Invite link revoked.")).toHaveCount(0);
  });

  test("terminating a session and revoking an invite say so (bug F30)", async ({ page, ownGateway }) => {
    test.fail();
    await terminateAndRevoke(page, await ownGateway());
    await expect(page.getByText("Session terminated.")).toBeVisible({ timeout: 1500 });
  });
});

test.describe("at a phone's width", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "the admin console is checked at 390 px");
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`no admin page overflows sideways in ${scheme}`, async ({ page, ownGateway }) => {
      const gateway = await ownGateway();
      await openAdmin(page, gateway, "");
      if (scheme === "dark") {
        await page.getByRole("button", { name: "Switch to dark theme" }).click();
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
      }
      for (const path of ["", "/server", "/operations"] as const) {
        await page.goto(`${gateway.url}/admin${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await overflowScan(page), `/admin${path} in ${scheme}`).toEqual({ clipped: [], pageScrolls: false });
      }
    });
  }

  // The sessions table is wider than the screen and scrolls inside its own box, so its action is
  // out of sight until the table is scrolled (bug F31).
  async function operationsWithASession(page: Page, gateway: Gateway) {
    const guest = await guestJoins(page, gateway, "ops-narrow");
    await expect(guest.getByRole("textbox", { name: "Search members" })).toBeVisible();
    await openAdmin(page, gateway, "/operations");
    await expect(sessionsTable(page)).toBeVisible();
  }

  test("F31: with a session listed, its Terminate button is off screen until the table is scrolled", async ({ page, ownGateway }) => {
    await operationsWithASession(page, await ownGateway());
    expect(await overflowScan(page)).toEqual({ clipped: ["OFFSCREEN:Terminate"], pageScrolls: false });
  });

  test("everything in the sessions table is on screen at 390 px (bug F31)", async ({ page, ownGateway }) => {
    test.fail();
    await operationsWithASession(page, await ownGateway());
    expect(await overflowScan(page)).toEqual({ clipped: [], pageScrolls: false });
  });
});
