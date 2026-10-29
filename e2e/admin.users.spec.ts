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

/** Fills the create dialog and submits it, which leaves the dialog on the created link. */
async function createInvite(page: Page, fields: { channel?: string; server?: string } = {}) {
  await page.getByRole("button", { name: "Create invite link" }).click();
  const dialog = page.getByRole("dialog", { name: "Create invite link" });
  if (fields.server) {
    await dialog.getByRole("combobox", { name: "Server" }).click();
    await page.getByRole("option", { name: fields.server }).click();
  }
  if (fields.channel) await dialog.getByLabel("Target channel").fill(fields.channel);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  const created = page.getByRole("dialog", { name: "Invite link created" });
  await expect(created).toBeVisible();
  return created;
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
    await expect(row).toContainText(/Guest IP \S+/);
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

test.describe("connection history", () => {
  const records = (page: Page) => page.locator(".connection-row");

  test("lists a guest once the session ended, by itself, with how long it lasted, and filters by status and name", async ({
    page,
    ownGateway,
  }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/users");
    await expect(page.getByText("No ended sessions yet.")).toBeVisible();

    // The sessions card and the history follow the gateway without a Refresh.
    const guest = await guestJoins(page, gateway, "history-guest");
    await expect(sessionsTable(page).getByRole("row").filter({ hasText: "history-guest" })).toContainText("Connected", { timeout: 15_000 });
    await expect(records(page)).toHaveCount(0);

    await guest.close();
    const row = records(page).filter({ hasText: "history-guest" });
    await expect(row).toContainText("Disconnected", { timeout: 15_000 });
    await expect(sessionsTable(page).getByRole("row").filter({ hasText: "history-guest" })).toHaveCount(0);
    await expect(row).toContainText("Duration");
    await expect(row).toContainText("From 127.0.0.1");
    await expect(row).toContainText("Browser: ");
    await expect(row).toContainText("User agent: Mozilla/5.0");

    await page.getByRole("link", { name: "View all connection records" }).click();
    await expect(records(page).filter({ hasText: "history-guest" })).toHaveCount(1);
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: "Connection failed" }).click();
    await expect(page.getByText("No connections match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Reset filters" }).click();
    await page.getByRole("searchbox", { name: "Search by name, address or server" }).fill("history-g");
    await expect(records(page)).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Search by name, address or server" }).fill("nobody");
    await expect(page.getByText("No connections match these filters.")).toBeVisible();
  });

  test("a terminated session is in the history at once", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    const guest = await guestJoins(page, gateway, "ops-terminated");
    await expect(guest.getByRole("textbox", { name: "Search members" })).toBeVisible();
    await openAdmin(page, gateway, "/users");
    await sessionsTable(page).getByRole("row").filter({ hasText: "ops-terminated" }).getByRole("button", { name: "Terminate" }).click();
    await page.getByRole("dialog", { name: "Terminate session" }).getByRole("button", { name: "Terminate" }).click();
    await expect(records(page).filter({ hasText: "ops-terminated" })).toContainText("Disconnected", { timeout: 3000 });
  });
});

test.describe("invites", () => {
  test("says when there are none; creating one shows its link once, and lists it as active and unused", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/users");
    await expect(page.getByText("No invite links yet.")).toBeVisible();
    const created = await createInvite(page, { channel: "Room A" });

    await expect(created.getByText("Copy and share it now. For security, the full token will not be shown again.")).toBeVisible();
    await expect(created.getByLabel("Invite link created")).toHaveValue(new RegExp(`^${gateway.url}/\\?invite=[\\w-]+$`));
    await created.getByRole("button", { name: "Close" }).click();
    await expect(created).toBeHidden();
    const item = page.locator(".invite-row").filter({ hasText: "Room A" });
    await expect(item).toContainText("Active");
    await expect(item).toContainText("0 used");
    await expect(item).toContainText("Expires");
  });

  test("a limited invite reads 'x of y used'", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/users");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const dialog = page.getByRole("dialog", { name: "Create invite link" });
    await dialog.getByLabel("Maximum uses").fill("5");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("dialog", { name: "Invite link created" }).getByRole("button", { name: "Close" }).click();
    await expect(page.locator(".invite-row").first()).toContainText("0 of 5 used");
  });

  test("an invite is made for the server picked in the dialog, and the first one is the default", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test:9988" });
    await openAdmin(page, gateway, "/users");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const server = page.getByRole("dialog", { name: "Create invite link" }).getByRole("combobox", { name: "Server" });
    await expect(server).toHaveText("WebSpeak");
    await server.click();
    await expect(page.getByRole("option")).toHaveText(["WebSpeak", "Clan"]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const created = await createInvite(page, { server: "Clan", channel: "Clan room" });
    await created.getByRole("button", { name: "Close" }).click();
    await expect(page.locator(".invite-row").filter({ hasText: "Clan room" })).toContainText("clan.example.test:9988");
  });

  test("the link takes a guest into the invite's channel and uses one up; Copy link copies it", async ({ page, context, ownGateway }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/users");
    const created = await createInvite(page, { channel: "Room A" });
    const link = await created.getByLabel("Invite link created").inputValue();

    await created.getByRole("button", { name: "Copy link" }).click();
    await expect(toast(page, "Invite link copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await created.getByRole("button", { name: "Close" }).click();

    const guest = await guestJoins(page, gateway, "ops-invited", link);
    await expect(guest.getByRole("textbox", { name: "Search members" })).toBeVisible();
    const member = [...gateway.ts.members.values()].find((candidate) => candidate.nickname === "ops-invited")!;
    expect(gateway.ts.channels.get(member.channelID)?.name).toBe("Room A");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.locator(".invite-row").filter({ hasText: "Room A" })).toContainText("1 used");
  });

  test("Revoke asks first, and a revoked link no longer lets a guest in", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/users");
    const created = await createInvite(page);
    const link = await created.getByLabel("Invite link created").inputValue();
    await created.getByRole("button", { name: "Close" }).click();
    const item = page.locator(".invite-row").first();
    await expect(item).toContainText("Active");

    await item.getByRole("button", { name: "Revoke invite for Default channel" }).click();
    const dialog = page.getByRole("dialog", { name: "Revoke invite link" });
    await expect(dialog).toContainText("Revoke this invite link?");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(item).toContainText("Active");

    await item.getByRole("button", { name: "Revoke invite for Default channel" }).click();
    await page.getByRole("dialog", { name: "Revoke invite link" }).getByRole("button", { name: "Revoke" }).click();
    await expect(item).toContainText("Revoked");
    await expect(item.getByRole("button", { name: "Revoke" })).toHaveCount(0);

    const guest = await guestJoins(page, gateway, "ops-late", link);
    await expect(guest.getByText("The invite link is invalid, expired, or revoked")).toBeVisible();
  });
});

/** Makes `count` invites for the default server, straight on the gateway, so a test can start with a long list. */
function seedInvites(gateway: Gateway, count: number): string[] {
  const serverId = gateway.adminService.listServers()[0]!.id;
  return Array.from(
    { length: count },
    (_, index) =>
      gateway.adminService.createManagedInvite({
        serverId,
        channel: `Seed ${String(index + 1).padStart(2, "0")}`,
        expiresInHours: 1,
        maxUses: 0,
      }).invite.id,
  );
}

test.describe("a long list of invites", () => {
  test("the card shows the newest eight and leads to the full list", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    seedInvites(gateway, 11);
    await openAdmin(page, gateway, "/users");
    await expect(page.locator(".invite-row")).toHaveCount(8);
    await expect(page.getByText("Showing 8 of 11")).toBeVisible();

    await page.getByRole("link", { name: "View all invites" }).click();
    await expect(page).toHaveURL(`${gateway.url}/admin/users/invites`);
    await expect(page.getByRole("heading", { name: "Managed invites", level: 1 })).toBeVisible();
    await expect(page.locator(".invite-row")).toHaveCount(11);
    const nav = page.getByRole("navigation", { name: "Admin pages" });
    await expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "true");

    await page.getByRole("link", { name: "Users" }).last().click();
    await expect(page).toHaveURL(`${gateway.url}/admin/users`);
    await expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
  });

  test("the full list has pages and a filter by status", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    const ids = seedInvites(gateway, 27);
    gateway.adminService.revokeManagedInvite(ids[0]!);
    await openAdmin(page, gateway, "/users");
    await page.goto(`${gateway.url}/admin/users/invites`);
    await expect(page.locator(".invite-row")).toHaveCount(25);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(page.locator(".invite-row")).toHaveCount(2);

    await page.getByRole("radio", { name: "Revoked" }).click();
    await expect(page.locator(".invite-row")).toHaveCount(1);
    await expect(page.locator(".invite-row").first()).toContainText("Seed 01");
    await expect(page.getByRole("navigation", { name: "Pages", exact: true })).toHaveCount(0);
    await page.getByRole("radio", { name: "All" }).click();
    await expect(page.locator(".invite-row")).toHaveCount(25);
  });

  test("revoking from the full list keeps the list in place", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    seedInvites(gateway, 3);
    await openAdmin(page, gateway, "/users");
    await page.goto(`${gateway.url}/admin/users/invites`);
    await page.getByRole("radio", { name: "Active" }).click();
    await expect(page.locator(".invite-row")).toHaveCount(3);
    await page.getByRole("button", { name: "Revoke invite for Seed 03" }).click();
    await page.getByRole("dialog", { name: "Revoke invite link" }).getByRole("button", { name: "Revoke" }).click();
    await expect(page.locator(".invite-row")).toHaveCount(2);
  });

  test("creating an invite from the full list adds it to the top", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    seedInvites(gateway, 2);
    await openAdmin(page, gateway, "/users");
    await page.goto(`${gateway.url}/admin/users/invites`);
    const created = await createInvite(page, { channel: "Fresh" });
    await created.getByRole("button", { name: "Close" }).click();
    await expect(page.locator(".invite-row")).toHaveCount(3);
    await expect(page.locator(".invite-row").first()).toContainText("Fresh");
  });
});

test.describe("the dashboard", () => {
  test("counts the active invites and leads to them", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    const ids = seedInvites(gateway, 3);
    gateway.adminService.revokeManagedInvite(ids[0]!);
    await openAdmin(page, gateway, "");
    const metric = page.getByRole("article").filter({ hasText: "Active invites" });
    await expect(metric).toContainText("2");
    await metric.getByRole("link", { name: "Manage invites" }).click();
    await expect(page).toHaveURL(`${gateway.url}/admin/users/invites`);
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
    await (await createInvite(page)).getByRole("button", { name: "Close" }).click();
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
    await (await createInvite(page)).getByRole("button", { name: "Close" }).click();
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
