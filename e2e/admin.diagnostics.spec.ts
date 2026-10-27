import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../test/support/gateway";

// The admin console's Diagnostics page: runtime facts with the report and backup, the event log and the logs. Each test has a
// gateway of its own (`ownGateway`), the console is asked for English.

async function openDiagnostics(page: Page, gateway: Gateway): Promise<void> {
  await page.goto(`${gateway.url}/admin/login`);
  await page.getByLabel("Admin username").fill("admin");
  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await page.goto(`${gateway.url}/admin/diagnostics`);
  await expect(page.getByRole("heading", { name: "Diagnostics", level: 1 })).toBeVisible();
}

test.describe("diagnostics", () => {
  test("shows the runtime facts, the event log and the logs, each under its own heading", async ({ page, ownGateway }) => {
    await openDiagnostics(page, await ownGateway());
    await expect(page.getByRole("heading", { name: "System information" })).toBeVisible();
    await expect(page.getByText("Database schema")).toBeVisible();
    await expect(page.getByRole("list", { name: "Event log" })).toContainText("Administrator signed in");
    await expect(page.getByRole("heading", { name: "Runtime logs" })).toBeVisible();
    await expect(page.getByText("Running version")).toBeVisible();
  });

  test("Export database backup downloads the file and the page picks up the new event", async ({ page, ownGateway }) => {
    await openDiagnostics(page, await ownGateway());
    const events = page.getByRole("list", { name: "Event log" });
    const before = await events.getByRole("listitem").count();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export database backup" }).click();
    expect((await download).suggestedFilename()).toMatch(/^webspeak-backup-\d{4}-\d{2}-\d{2}\.db$/);
    await expect(events.getByRole("listitem")).toHaveCount(before + 1);
  });

  test("Refresh reloads the page's data", async ({ page, ownGateway }) => {
    await openDiagnostics(page, await ownGateway());
    const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/diagnostics"));
    await page.getByRole("button", { name: "Refresh" }).click();
    expect((await answer).ok()).toBe(true);
  });
});
