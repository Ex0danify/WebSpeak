import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { overflowScan } from "./helpers";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../test/support/gateway";

// The admin console's Users page: the live sessions and the invite links, and the pages at a
// phone's width. Each test has a gateway of its own (`ownGateway`), the console is asked for English.

/** Signs in and opens the given admin page. */
async function openAdmin(page: Page, gateway: Gateway, path: "" | "/gateway" | "/users" | "/diagnostics"): Promise<void> {
  await page.goto(`${gateway.url}/admin/login`);
  await page.getByLabel("Admin username").fill("admin");
  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
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
/** The toast with this text; the announcement in the hidden live region is not a list item. */
const toast = (page: Page, text: string) => page.locator("li").filter({ hasText: text });

test.describe("sessions", () => {
  test("says when nobody is connected, lists a guest with its state, and Refresh picks up a new one", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/users");
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
    await openAdmin(page, gateway, "/users");

    await sessionsTable(page).getByRole("row").filter({ hasText: "ops-victim" }).getByRole("button", { name: "Terminate" }).click();
    await page.getByRole("dialog", { name: "Terminate session" }).getByRole("button", { name: "Terminate" }).click();
    await expect(guest.getByRole("button", { name: "Enter voice space" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("There are no active sessions.")).toBeVisible();
  });
});

test.describe("invites", () => {
  test("creating one shows its link once, and lists it as active and unused", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/users");
    await page.getByLabel("Target channel").fill("Room A");
    await page.getByRole("button", { name: "Create invite link" }).click();

    await expect(page.getByText("Copy and share it now. For security, the full token will not be shown again.")).toBeVisible();
    await expect(page.getByLabel("Invite link created")).toHaveValue(new RegExp(`^${gateway.url}/\\?invite=[\\w-]+$`));
    const item = page.locator(".invite-row").filter({ hasText: "Room A" });
    await expect(item).toContainText("Active");
    await expect(item).toContainText("0/∞");
  });

  test("an invite is made for the server picked in the form, and the first one is the default", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test:9988" });
    await openAdmin(page, gateway, "/users");
    const server = page.getByLabel("Server", { exact: true });
    await expect(server.locator("option")).toHaveText(["WebSpeak", "Clan"]);
    await expect(server.locator("option:checked")).toHaveText("WebSpeak");
    await server.selectOption({ label: "Clan" });
    await page.getByLabel("Target channel").fill("Clan room");
    await page.getByRole("button", { name: "Create invite link" }).click();
    await expect(page.locator(".invite-row").filter({ hasText: "Clan room" })).toContainText("clan.example.test:9988");
  });

  test("the link takes a guest into the invite's channel and uses one up; Copy link copies it", async ({ page, context, ownGateway }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/users");
    await page.getByLabel("Target channel").fill("Room A");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const link = await page.getByLabel("Invite link created").inputValue();

    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(toast(page, "Invite link copied.")).toBeVisible();
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
    await openAdmin(page, gateway, "/users");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const link = await page.getByLabel("Invite link created").inputValue();
    const item = page.locator(".invite-row").first();
    await expect(item).toContainText("Active");

    await item.getByRole("button", { name: "Revoke" }).click();
    const dialog = page.getByRole("dialog", { name: "Revoke invite link" });
    await expect(dialog).toContainText("Revoke this invite link?");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(item).toContainText("Active");

    await item.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("dialog", { name: "Revoke invite link" }).getByRole("button", { name: "Revoke" }).click();
    await expect(item).toContainText("Revoked");
    await expect(item.getByRole("button", { name: "Revoke" })).toHaveCount(0);

    const guest = await guestJoins(page, gateway, "ops-late", link);
    await expect(guest.getByText("The invite link is invalid, expired, or revoked")).toBeVisible();
  });
});

// Every successful action of the console says so in a toast.
test.describe("confirmations", () => {
  test("terminating a session and revoking an invite each say so, and a refused action shows no confirmation", async ({
    page,
    ownGateway,
  }) => {
    const gateway = await ownGateway();
    const guest = await guestJoins(page, gateway, "ops-notice");
    await expect(guest.getByRole("textbox", { name: "Search members" })).toBeVisible();
    await openAdmin(page, gateway, "/users");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const item = page.locator(".invite-row").first();
    await item.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("dialog", { name: "Revoke invite link" }).getByRole("button", { name: "Revoke" }).click();
    await expect(item).toContainText("Revoked");
    await expect(toast(page, "Invite link revoked.")).toBeVisible();
    await expect(toast(page, "Session terminated.")).toHaveCount(0);

    await sessionsTable(page).getByRole("row").filter({ hasText: "ops-notice" }).getByRole("button", { name: "Terminate" }).click();
    await page.getByRole("dialog", { name: "Terminate session" }).getByRole("button", { name: "Terminate" }).click();
    await expect(guest.getByRole("button", { name: "Enter voice space" })).toBeVisible();
    await expect(toast(page, "Session terminated.")).toBeVisible();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("There are no active sessions.")).toBeVisible();
  });

  test("declining the confirmation dialog changes nothing and shows no toast", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/users");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const item = page.locator(".invite-row").first();
    await item.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("dialog", { name: "Revoke invite link" }).getByRole("button", { name: "Cancel" }).click();
    await expect(item).toContainText("Active");
    await expect(page.locator("li").filter({ hasText: "revoked" })).toHaveCount(0);
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
      for (const path of ["", "/gateway", "/users", "/diagnostics"] as const) {
        await page.goto(`${gateway.url}/admin${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await overflowScan(page), `/admin${path} in ${scheme}`).toEqual({ clipped: [], pageScrolls: false });
      }
    });
  }

  // The table must not scroll inside its own box and hide the Terminate button off screen. At this
  // size the age and member columns are dropped and the table shrinks to fit.
  async function operationsWithASession(page: Page, gateway: Gateway) {
    const guest = await guestJoins(page, gateway, "ops-narrow");
    await expect(guest.getByRole("textbox", { name: "Search members" })).toBeVisible();
    await openAdmin(page, gateway, "/users");
    await expect(sessionsTable(page)).toBeVisible();
  }

  test("everything in the sessions table is on screen at 390 px", async ({ page, ownGateway }) => {
    await operationsWithASession(page, await ownGateway());
    expect(await overflowScan(page)).toEqual({ clipped: [], pageScrolls: false });
  });
});
