import { expect, type Page } from "@playwright/test";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../../test/support/gateway";

/** Signs in and opens the Gateway page. */
export async function openGatewayPage(page: Page, gateway: Gateway): Promise<void> {
  await page.goto(`${gateway.url}/admin/login`);
  await page.getByLabel("Admin username").fill("admin");
  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await reloadGatewayPage(page, gateway);
}

/** Opens the Gateway page afresh and waits until its settings have arrived, the form is not editable before. */
export async function reloadGatewayPage(page: Page, gateway: Gateway): Promise<void> {
  const settings = page.waitForResponse(
    (response) => response.url().endsWith("/api/admin/server") && response.request().method() === "GET",
  );
  await page.goto(`${gateway.url}/admin/gateway`);
  await expect(page.getByRole("heading", { name: "Gateway", level: 1 })).toBeVisible();
  await settings;
}

/** Logs out: the sidebar has the button on a desktop, on a phone it is in the account menu. */
export async function logOut(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
}
