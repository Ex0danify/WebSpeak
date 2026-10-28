import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../test/support/gateway";

// The admin console's Diagnostics page: runtime facts with the report and backup, the event log and the log retention. Each test has a
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
  test("shows the runtime facts, the event log and the log retention, each under its own heading", async ({ page, ownGateway }) => {
    await openDiagnostics(page, await ownGateway());
    await expect(page.getByRole("heading", { name: "System information" })).toBeVisible();
    await expect(page.getByText("Database schema")).toBeVisible();
    await expect(page.getByRole("list", { name: "Event log" })).toContainText("Administrator signed in");
    await expect(page.getByRole("heading", { name: "Log retention" })).toBeVisible();
    await expect(page.getByText("Running version")).toBeVisible();
  });

  test("the retention of the logs is saved by itself and held back when it is out of bounds", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openDiagnostics(page, gateway);
    const retention = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Log retention" }) });
    const events = retention.getByRole("group", { name: "Event log" });
    await expect(events.getByLabel("Days")).toHaveValue("90");
    await expect(events.getByLabel("Max entries")).toHaveValue("5000");
    const days = events.getByLabel("Days");
    const offset = async () => (await days.boundingBox())!.y - (await events.boundingBox())!.y;
    const before = await offset();
    await days.fill("14");
    await days.press("Tab");
    await expect(events.getByText("Saved")).toBeVisible();
    expect(await offset()).toBe(before);
    await expect.poll(() => gateway.database.getSettings().retention.eventLog.days).toBe(14);

    const connections = retention.getByRole("group", { name: "Connection history" });
    await connections.getByLabel("Max entries").fill("999999999999");
    await connections.getByLabel("Max entries").press("Tab");
    await expect(retention.getByText(/100.*100,?000/)).toBeVisible();
    expect(gateway.database.getSettings().retention.connections.maxRows).toBe(10000);
  });

  test("Download diagnostic bundle downloads a zip", async ({ page, ownGateway }) => {
    await openDiagnostics(page, await ownGateway());
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download diagnostic bundle" }).click();
    expect((await download).suggestedFilename()).toMatch(/^webspeak-diagnostics-.+-\d{4}-\d{2}-\d{2}\.zip$/);
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

  test("Refresh turns its arrow for a whole turn, also for someone who asked for less motion", async ({ page, ownGateway }) => {
    await openDiagnostics(page, await ownGateway());
    const refresh = page.getByRole("button", { name: "Refresh" });
    await refresh.click();
    await expect(refresh).toHaveAttribute("aria-busy", "true");
    expect(await refresh.locator("svg").evaluate((icon) => getComputedStyle(icon).animationName)).toBe("spin");
    await expect(refresh).not.toHaveAttribute("aria-busy", "true", { timeout: 3000 });
  });

  test("Refresh reloads the page's data", async ({ page, ownGateway }) => {
    await openDiagnostics(page, await ownGateway());
    const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/diagnostics"));
    await page.getByRole("button", { name: "Refresh" }).click();
    expect((await answer).ok()).toBe(true);
  });
});
