import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { overflowScan } from "./helpers";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../test/support/gateway";

// The admin console's event log: the card with the newest events and the full view with its filters, search and pages. Each
// test has a gateway of its own (`ownGateway`), the console is asked for English.

async function openAdmin(page: Page, gateway: Gateway, path: "" | "/diagnostics" | "/diagnostics/events"): Promise<void> {
  await page.goto(`${gateway.url}/admin/login`);
  await page.getByLabel("Admin username").fill("admin");
  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  if (path) await page.goto(`${gateway.url}/admin${path}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

const rows = (page: Page) => page.locator(".event-row");
const openSeverities = (page: Page) => page.getByRole("button", { name: /^Severities/ }).click();
const openCategories = (page: Page) => page.getByRole("button", { name: /^Categories/ }).click();

test.describe("the event log card", () => {
  test("shows the newest events on the dashboard and the diagnostics page, without the availability changes", async ({
    page,
    ownGateway,
  }) => {
    const gateway = await ownGateway();
    gateway.database.addAudit("SERVER_UNAVAILABLE", { id: "x", name: "Hidden server", code: "TIMEOUT" });
    for (let index = 0; index < 9; index += 1) gateway.database.addAudit("SERVER_ADDED", { name: `Seed ${index}`, target: "h:1" });
    await openAdmin(page, gateway, "");
    await expect(rows(page)).toHaveCount(5);
    await expect(page.getByText("Hidden server")).toBeHidden();
    await page.goto(`${gateway.url}/admin/diagnostics`);
    await expect(rows(page)).toHaveCount(8);
    await expect(page.getByText(/Showing 8 of \d+/)).toBeVisible();
  });

  test("a warning is marked with its severity in words, not only in color", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.database.addAudit("ADMIN_LOGIN_FAILED");
    await openAdmin(page, gateway, "");
    const row = rows(page).filter({ hasText: "Administrator login failed" });
    await expect(row).toContainText("Warning");
  });
});

test.describe("the full event log", () => {
  test("opens from the card, keeps Diagnostics marked in the nav and leads back", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/diagnostics");
    await page.getByRole("link", { name: "Open the event log" }).click();
    await expect(page).toHaveURL(`${gateway.url}/admin/diagnostics/events`);
    await expect(page.getByRole("heading", { name: "Event log", level: 1 })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Admin pages" });
    await expect(nav.getByRole("link", { name: "Diagnostics" })).toHaveAttribute("aria-current", "true");
    await page.getByRole("link", { name: "Diagnostics" }).last().click();
    await expect(page).toHaveURL(`${gateway.url}/admin/diagnostics`);
  });

  test("hides the availability changes until their category is switched on", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.database.addAudit("SERVER_UNAVAILABLE", { id: "x", name: "Main", code: "TIMEOUT" });
    await openAdmin(page, gateway, "/diagnostics/events");
    await expect(page.getByText("Server not reachable")).toBeHidden();
    await openCategories(page);
    await page.getByRole("checkbox", { name: "Availability" }).click();
    const row = rows(page).filter({ hasText: "Server not reachable" });
    await expect(row).toContainText("Main");
    await expect(row).toContainText("Error");
    await page.getByRole("checkbox", { name: "Availability" }).click();
    await expect(page.getByText("Server not reachable")).toBeHidden();
  });

  test("hides the sessions until their category is switched on", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.database.addAudit("SESSION_CONNECTED", { id: "w-1", nickname: "alice", clientIp: "10.0.0.1", target: "ts.test:9987" });
    gateway.database.addAudit("GATEWAY_STARTED", { version: "1.2.3" });
    await openAdmin(page, gateway, "/diagnostics/events");
    await expect(rows(page).filter({ hasText: "Gateway started" })).toContainText("Version 1.2.3");
    await expect(page.getByText("Session connected")).toBeHidden();
    await openCategories(page);
    await page.getByRole("checkbox", { name: "Sessions" }).click();
    await expect(rows(page).filter({ hasText: "Session connected" })).toContainText("alice · IP 10.0.0.1 · ts.test:9987");
  });

  test("filters by category and by severity, and says when nothing matches", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.database.addAudit("ADMIN_LOGIN_FAILED");
    gateway.database.addAudit("INVITE_CREATED", { serverName: "Main", channel: "Lobby" });
    await openAdmin(page, gateway, "/diagnostics/events");
    await expect(rows(page).filter({ hasText: "Invite link created" })).toHaveCount(1);

    await openSeverities(page);
    await page.getByRole("checkbox", { name: "Info" }).click();
    await page.keyboard.press("Escape");
    await expect(rows(page).filter({ hasText: "Administrator login failed" })).toHaveCount(1);
    await expect(rows(page).filter({ hasText: "Invite link created" })).toHaveCount(0);

    await openCategories(page);
    await page.getByRole("checkbox", { name: "Sign-in" }).click();
    await page.keyboard.press("Escape");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByText("No events match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Reset filters" }).click();
    await openCategories(page);
    await expect(page.getByRole("checkbox", { name: "Sign-in" })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(rows(page).filter({ hasText: "Invite link created" })).toHaveCount(1);
  });

  test("searches the names and details, and a time range narrows the list", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.database.addAudit("INVITE_CREATED", { serverName: "Main", channel: "Quiz night" });
    gateway.database.addAudit("INVITE_CREATED", { serverName: "Main", channel: "Lobby" });
    await openAdmin(page, gateway, "/diagnostics/events");
    await page.getByRole("searchbox", { name: "Search events" }).fill("quiz");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("Quiz night");
    await page.getByRole("searchbox", { name: "Search events" }).fill("");
    await expect(rows(page).filter({ hasText: "Lobby" })).toHaveCount(1);
    await page.getByRole("combobox", { name: "Time range" }).click();
    await page.getByRole("option", { name: "Last 24 hours" }).click();
    await expect(rows(page).filter({ hasText: "Lobby" })).toHaveCount(1);
  });

  test("has pages, with the number of events in the footer", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    for (let index = 0; index < 30; index += 1) gateway.database.addAudit("SERVER_ADDED", { name: `Seed ${index}`, target: "h:1" });
    await openAdmin(page, gateway, "/diagnostics/events");
    await expect(rows(page)).toHaveCount(25);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible();
  });

  test("jumps to a page by its number or to either end, and the page size is a choice that is kept", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    for (let index = 0; index < 230; index += 1) gateway.database.addAudit("SERVER_ADDED", { name: `Seed ${index}`, target: "h:1" });
    await openAdmin(page, gateway, "/diagnostics/events");
    await expect(page.getByText("Page 1 of 10")).toBeVisible();
    await page.getByRole("button", { name: "Page 10", exact: true }).click();
    await expect(page.getByRole("button", { name: "Page 10", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Page 10 of 10")).toBeVisible();
    await page.getByRole("button", { name: "First page" }).click();
    await expect(page.getByText("Page 1 of 10")).toBeVisible();
    await page.getByRole("button", { name: "Last page" }).click();
    await expect(page.getByText("Page 10 of 10")).toBeVisible();
    await page.getByRole("button", { name: "Page 9", exact: true }).click();
    await expect(page.getByText("Page 9 of 10")).toBeVisible();
    await page.getByRole("combobox", { name: "Entries per page" }).click();
    await page.getByRole("option", { name: "100", exact: true }).click();
    await expect(page.getByText("Page 3 of 3")).toBeVisible();
    await page.reload();
    await expect(rows(page)).toHaveCount(100);
    await expect(page.getByRole("combobox", { name: "Entries per page" })).toHaveText("100");
  });

  test("says where an entry came from and what it changed", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.database.addAudit("ADMIN_LOGIN_FAILED", { username: "mallory", ip: "203.0.113.9" });
    gateway.database.addAudit("SETTINGS_CHANGED", {
      accessMode: "open",
      changes: [{ field: "siteName", from: "WebSpeak", to: "Clan" }],
      ip: "198.51.100.2",
    });
    await openAdmin(page, gateway, "/diagnostics/events");
    await expect(rows(page).filter({ hasText: "mallory" })).toContainText("IP 203.0.113.9");
    await expect(rows(page).filter({ hasText: "Site display name: WebSpeak → Clan" })).toContainText("IP 198.51.100.2");
  });

  test("is on screen at 390 px", async ({ page, ownGateway }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const gateway = await ownGateway();
    gateway.database.addAudit("SERVER_UNAVAILABLE", { id: "x", name: "A server with a rather long name", code: "TIMEOUT" });
    for (let index = 0; index < 130; index += 1) gateway.database.addAudit("SERVER_ADDED", { name: `Seed ${index}`, target: "h:1" });
    await openAdmin(page, gateway, "/diagnostics/events");
    await openCategories(page);
    await page.getByRole("checkbox", { name: "Availability" }).click();
    await page.keyboard.press("Escape");
    await expect(rows(page).first()).toBeVisible();
    expect(await overflowScan(page)).toEqual({ clipped: [], pageScrolls: false });
  });
});
