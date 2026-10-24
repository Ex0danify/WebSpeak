import { expect, type Page } from "@playwright/test";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../../test/support/gateway";

/** Signs in and opens the Server page. */
export async function openServerPage(page: Page, gateway: Gateway): Promise<void> {
  await page.goto(`${gateway.url}/admin/login`);
  await page.getByLabel("Admin username").fill("admin");
  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await reloadServerPage(page, gateway);
}

/** Opens the Server page afresh and waits until its settings have arrived, the form is not editable before. */
export async function reloadServerPage(page: Page, gateway: Gateway): Promise<void> {
  const settings = page.waitForResponse(
    (response) => response.url().endsWith("/api/admin/server") && response.request().method() === "GET",
  );
  await page.goto(`${gateway.url}/admin/server`);
  await expect(page.getByRole("heading", { name: "Server settings" })).toBeVisible();
  await settings;
}
