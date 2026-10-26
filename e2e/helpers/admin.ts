import { expect, type Page } from "@playwright/test";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../../test/support/gateway";

async function signIn(page: Page, gateway: Gateway): Promise<void> {
  await page.goto(`${gateway.url}/admin/login`);
  await page.getByLabel("Admin username").fill("admin");
  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
}

/** Signs in and opens the Gateway page. */
export async function openGatewayPage(page: Page, gateway: Gateway): Promise<void> {
  await signIn(page, gateway);
  await reloadGatewayPage(page, gateway);
}

/** Signs in and opens the Web page. */
export async function openWebPage(page: Page, gateway: Gateway): Promise<void> {
  await signIn(page, gateway);
  await reloadWebPage(page, gateway);
}

/** Opens the Gateway page afresh and waits until its settings have arrived, the form is not editable before. */
export async function reloadGatewayPage(page: Page, gateway: Gateway): Promise<void> {
  await reloadSettingsPage(page, gateway, "gateway", "Gateway");
}

/** Opens the Web page afresh and waits until its settings have arrived. */
export async function reloadWebPage(page: Page, gateway: Gateway): Promise<void> {
  await reloadSettingsPage(page, gateway, "web", "Web");
}

async function reloadSettingsPage(page: Page, gateway: Gateway, path: string, heading: string): Promise<void> {
  const settings = page.waitForResponse(
    (response) => response.url().endsWith("/api/admin/server") && response.request().method() === "GET",
  );
  await page.goto(`${gateway.url}/admin/${path}`);
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  await settings;
}

/** Logs out: the sidebar has the button on a desktop, on a phone it is in the account menu. */
export async function logOut(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
}
