import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { BOOTSTRAP } from "../test/support/adminService";
import { logOut } from "./helpers/admin";
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

/** Signs in with the password the harness set and waits for the dashboard. */
async function login(page: Page, gateway: Gateway): Promise<void> {
  await submitLogin(page, gateway, TEST_ADMIN_PASSWORD);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
}

const path = (page: Page): string => new URL(page.url()).pathname;

test.describe("sign in", () => {
  test("asks for the account, and a visitor without a session is sent to the form from any admin page", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await page.goto(`${gateway.url}/admin/gateway`);
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
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    expect(path(page)).toBe("/admin");
  });

  test("Log out ends the session: the form is back and admin pages are closed again", async ({ page, ownGateway, isMobile }) => {
    const gateway = await ownGateway();
    await login(page, gateway);
    await logOut(page, isMobile);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.goto(`${gateway.url}/admin/users`);
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

    for (const other of ["/admin", "/admin/gateway", "/admin/web", "/admin/users", "/admin/diagnostics"]) {
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

  test("a new password opens the console, and the old one no longer signs in", async ({ page, ownGateway, isMobile }) => {
    const gateway = await ownGateway({ forcePasswordChange: true });
    await submitLogin(page, gateway, BOOTSTRAP.password);
    await page.getByLabel("New admin password").fill("a brand new admin password");
    await page.getByLabel("Confirm admin password").fill("a brand new admin password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    await logOut(page, isMobile);
    await submitLogin(page, gateway, BOOTSTRAP.password);
    await expect(page.getByText("The admin password is incorrect.")).toBeVisible();
    await page.getByLabel("Admin password").fill("a brand new admin password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  });
});

test.describe("dashboard and navigation", () => {
  test("the dashboard shows the status, the servers and a preview of the events, and each page is one tap away", async ({
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
    // The guest page link is in the sidebar on a desktop and in the account menu on a phone.
    if (isMobile) {
      await page.getByRole("button", { name: "Account" }).click();
      await expect(page.getByRole("button", { name: "Open guest page" })).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
    } else {
      await expect(page.getByRole("link", { name: "Open guest page" })).toHaveAttribute("href", "/");
    }

    await page.getByRole("link", { name: "Manage", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Gateway", level: 1 })).toBeVisible();
    expect(path(page)).toBe("/admin/gateway");
    const nav = page.getByRole("navigation", { name: "Admin pages" });
    for (const [link, address] of [
      ["Web", "/admin/web"],
      ["Users", "/admin/users"],
      ["Diagnostics", "/admin/diagnostics"],
      ["Dashboard", "/admin"],
    ] as const) {
      await nav.getByRole("link", { name: link }).click();
      await expect(page.getByRole("heading", { name: link, level: 1 })).toBeVisible();
      expect(path(page)).toBe(address);
      await expect(nav.getByRole("link", { name: link })).toHaveAttribute("aria-current", "page");
    }
  });

  test("View all leads from the recent events to the audit trail", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await login(page, gateway);
    await page.getByRole("link", { name: "View all" }).click();
    await expect(page.getByRole("heading", { name: "Diagnostics", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Audit trail" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Audit trail" })).toContainText("Administrator signed in");
  });

  test("the page nav is a bar along the bottom edge of a phone and stays there while the page scrolls", async ({
    page,
    ownGateway,
    isMobile,
  }) => {
    test.skip(!isMobile, "the bottom bar is the phone's layout");
    const gateway = await ownGateway();
    await login(page, gateway);
    await page.goto(`${gateway.url}/admin/gateway`);
    await expect(page.getByRole("heading", { name: "Gateway", level: 1 })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Admin pages" });
    const bottom = async () => {
      const box = (await nav.boundingBox())!;
      return Math.round(box.y + box.height);
    };
    const height = page.viewportSize()!.height;
    expect(await bottom()).toBe(height);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    expect(await bottom()).toBe(height);
    for (const link of ["Dashboard", "Gateway", "Web", "Users", "Diagnostics"]) {
      const box = (await nav.getByRole("link", { name: link }).boundingBox())!;
      expect(box.height, `${link} is at least 44 px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test("a page scrolls as a whole: the invite form is not inside a scroller of its own", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await login(page, gateway);
    await page.goto(`${gateway.url}/admin/users`);
    const form = page.getByRole("button", { name: "Create invite link" });
    await expect(form).toBeVisible();
    const scrollers = await form.evaluate((element) => {
      const found: string[] = [];
      for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden") found.push(node.tagName + "." + node.className);
      }
      return found;
    });
    expect(scrollers).toEqual([]);
  });
});

test.describe("a gateway that goes away", () => {
  test("the top bar and the dashboard say so, and a page that cannot load does not blame the form", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await login(page, gateway);
    const chip = page.getByRole("banner").getByRole("status");
    await expect(chip).toContainText("Gateway running");

    await gateway.stop();
    // The check runs every 20 s, a tab that is shown again checks at once.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(chip).toContainText("Gateway unreachable");
    await expect(page.getByRole("heading", { name: "Gateway unreachable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry now" })).toBeVisible();

    await page.getByRole("link", { name: "Gateway", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Gateway", level: 1 })).toBeVisible();
    await expect(page.getByText("The request failed")).toHaveCount(0);
    for (const dot of await page.locator(".server-row i").all()) await expect(dot).not.toHaveClass(/bg-danger/);
  });
});

test.describe("unknown page", () => {
  test("an address that is no console page shows the dashboard and is corrected to /admin", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await login(page, gateway);
    await page.goto(`${gateway.url}/admin/nowhere`);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect.poll(() => path(page)).toBe("/admin");
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
