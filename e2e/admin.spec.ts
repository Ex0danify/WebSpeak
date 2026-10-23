import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { BOOTSTRAP } from "../test/support/adminService";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../test/support/gateway";

// The admin console against a gateway of its own (`ownGateway`), because these tests change what
// every visitor sees and use up the login rate limit. The console follows the stored language, else the
// browser's; the fixtures store English.

async function submitLogin(page: Page, gateway: Gateway, password: string, username = "admin"): Promise<void> {
  await page.goto(`${gateway.url}/admin`);
  await page.getByLabel("Admin username").fill(username);
  await page.getByLabel("Admin password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in with the password the harness set and waits for the overview. */
async function login(page: Page, gateway: Gateway): Promise<void> {
  await submitLogin(page, gateway, TEST_ADMIN_PASSWORD);
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
}

const path = (page: Page): string => new URL(page.url()).pathname;

test.describe("sign in", () => {
  test("asks for the account, and a visitor without a session is sent to the form from any admin page", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await page.goto(`${gateway.url}/admin/server`);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(path(page)).toBe("/admin/login");
    await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  });

  test("a wrong password says so and keeps the form, and the right one gets in", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await submitLogin(page, gateway, "not the password");
    await expect(page.getByText("The admin password is incorrect.")).toBeVisible();
    expect(path(page)).toBe("/admin/login");
    await expect(page.getByLabel("Admin username")).toHaveValue("admin");

    await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    expect(path(page)).toBe("/admin");
  });

  test("Log out ends the session: the form is back and admin pages are closed again", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await login(page, gateway);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.goto(`${gateway.url}/admin/operations`);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(path(page)).toBe("/admin/login");
  });
});

test.describe("first sign in", () => {
  test("the default password has to be changed before anything else is open", async ({ page, ownGateway }) => {
    const gateway = await ownGateway({ forcePasswordChange: true });
    await submitLogin(page, gateway, BOOTSTRAP.password);
    await expect(page.getByRole("heading", { name: "Change the default password" })).toBeVisible();
    expect(path(page)).toBe("/admin/change-password");

    for (const other of ["/admin", "/admin/server", "/admin/operations"]) {
      await page.goto(`${gateway.url}${other}`);
      await expect(page.getByRole("heading", { name: "Change the default password" })).toBeVisible();
    }
  });

  test("a password that is too short, or that does not match, is refused with the reason", async ({ page, ownGateway }) => {
    const gateway = await ownGateway({ forcePasswordChange: true });
    await submitLogin(page, gateway, BOOTSTRAP.password);
    const save = page.getByRole("button", { name: "Save new password" });

    await page.getByLabel("New admin password").fill("short");
    await page.getByLabel("Confirm admin password").fill("short");
    await save.click();
    await expect(page.getByText("The admin password must be at least 12 characters.")).toBeVisible();

    await page.getByLabel("New admin password").fill("a long enough password 1");
    await page.getByLabel("Confirm admin password").fill("a long enough password 2");
    await save.click();
    await expect(page.getByText("The two passwords do not match.")).toBeVisible();
    expect(path(page)).toBe("/admin/change-password");
  });

  test("a new password opens the console, and the old one no longer signs in", async ({ page, ownGateway }) => {
    const gateway = await ownGateway({ forcePasswordChange: true });
    await submitLogin(page, gateway, BOOTSTRAP.password);
    await page.getByLabel("New admin password").fill("a brand new admin password");
    await page.getByLabel("Confirm admin password").fill("a brand new admin password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await submitLogin(page, gateway, BOOTSTRAP.password);
    await expect(page.getByText("The admin password is incorrect.")).toBeVisible();
    await page.getByLabel("Admin password").fill("a brand new admin password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  });
});

test.describe("overview", () => {
  test("shows the status, the servers and the recent events, and links to the settings and the guest page", async ({
    page,
    ownGateway,
    isMobile,
  }) => {
    const gateway = await ownGateway();
    await login(page, gateway);
    await expect(page.getByRole("heading", { name: "WebSpeak is running" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Server health" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent events" })).toBeVisible();
    await expect(page.getByText("Administrator signed in")).toBeVisible();
    // A phone's narrow sidebar leaves the guest page link out.
    if (!isMobile) await expect(page.getByRole("link", { name: "Open guest page" })).toHaveAttribute("href", "/");

    await page.getByRole("link", { name: "Manage" }).click();
    await expect(page.getByRole("heading", { name: "Server settings" })).toBeVisible();
    expect(path(page)).toBe("/admin/server");
    for (const [link, heading] of [
      ["Operations", "Operations"],
      ["Overview", "Overview"],
    ] as const) {
      await page.getByRole("link", { name: link, exact: true }).first().click();
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });
});

test.describe("language", () => {
  // The console starts from the same detection as the join page: a stored language, else the browser's, else
  // English.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("webspeak:language"));
  });

  test("an English browser gets the console in English, as the join page does", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await page.goto(`${gateway.url}/admin`);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("a browser in another language gets the console in that language, and the stored language wins over it", async ({
    browser,
    ownGateway,
  }) => {
    const gateway = await ownGateway();
    const german = await browser.newContext({ locale: "de-DE" });
    const germanPage = await german.newPage();
    await germanPage.goto(`${gateway.url}/admin`);
    await expect(germanPage.getByRole("heading", { name: "Willkommen zurück" })).toBeVisible();
    await germanPage.evaluate(() => localStorage.setItem("webspeak:language", "en"));
    await germanPage.goto(`${gateway.url}/admin`);
    await expect(germanPage.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await german.close();

    // A retired language (zh) is not offered any more: the browser falls back to English.
    const chinese = await browser.newContext({ locale: "zh-CN" });
    const chinesePage = await chinese.newPage();
    await chinesePage.goto(`${gateway.url}/admin`);
    await expect(chinesePage.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await chinese.close();
  });
});
