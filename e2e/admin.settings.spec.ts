import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openServerPage, reloadServerPage } from "./helpers/admin";
import type { Gateway } from "../test/support/gateway";

// The admin console's Server page: what the administrator edits, what a save keeps, and what the
// guests then see. Each test has a gateway of its own (`ownGateway`), the console is asked for English.

/** Clicks Save changes and waits for the gateway's answer. */
async function save(page: Page): Promise<number> {
  const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/server") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save changes" }).click();
  return (await answer).status();
}

const siteName = (page: Page): Locator => page.getByLabel("Site display name");
/** What the guests' page is told about the site. */
const publicConfig = async (gateway: Gateway): Promise<Record<string, unknown>> => (await gateway.request("/api/public-config")).json();

test.describe("save", () => {
  test("keeps what was edited across a reload, and saving the old value restores it", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    const original = await siteName(page).inputValue();

    await siteName(page).fill("Night Owls");
    expect(await save(page)).toBe(200);
    await reloadServerPage(page, gateway);
    await expect(siteName(page)).toHaveValue("Night Owls");

    await siteName(page).fill(original);
    expect(await save(page)).toBe(200);
    await reloadServerPage(page, gateway);
    await expect(siteName(page)).toHaveValue(original);
  });

  test("the site name reaches the guests' page", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await siteName(page).fill("Night Owls Voice");
    expect(await save(page)).toBe(200);
    expect(JSON.stringify(await publicConfig(gateway))).toContain("Night Owls Voice");
  });

  test("the guest access mode is a choice of two, and the choice is kept", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    const fixed = page.getByRole("radio", { name: /Only the configured servers/ });
    const open = page.getByRole("radio", { name: /Also allow other TeamSpeak servers/ });
    await expect(fixed).toBeChecked();
    await open.click();
    await expect(open).toBeChecked();
    await expect(fixed).not.toBeChecked();
    expect(await save(page)).toBe(200);
    await reloadServerPage(page, gateway);
    await expect(page.getByRole("radio", { name: /Also allow other TeamSpeak servers/ })).toBeChecked();
  });

  test("a refused setting is shown as an alert, and nothing is kept", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await siteName(page).fill("");
    expect(await save(page)).toBe(400);
    await expect(page.getByRole("alert")).toBeVisible();
    await reloadServerPage(page, gateway);
    await expect(siteName(page)).not.toHaveValue("");
  });

  // Every successful action of the console says so in a toast.
  test("a successful save says so in a toast, and a refused one shows the alert and no toast", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    const saved = page.locator("li").filter({ hasText: "Settings saved." });
    await expect(saved).toHaveCount(0);
    await siteName(page).fill("Loud Save");
    expect(await save(page)).toBe(200);
    await expect(saved).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);

    await saved.getByRole("button", { name: "Close" }).click();
    await expect(saved).toHaveCount(0);
    await siteName(page).fill("");
    expect(await save(page)).toBe(400);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(saved).toHaveCount(0);
  });
});

test.describe("welcome message", () => {
  test("has one text per language, each kept, and the guests get the one for their language", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    const language = page.getByLabel("Welcome message language");
    await language.selectOption("de");
    await expect(page.getByLabel("Welcome message · Deutsch")).toBeVisible();
    await page.getByLabel("Welcome message · Deutsch").fill("Willkommen bei den Nachteulen");
    await language.selectOption("en");
    await expect(page.getByLabel("Welcome message · English")).toHaveValue("");
    await page.getByLabel("Welcome message · English").fill("Welcome, night owls");
    expect(await save(page)).toBe(200);

    await reloadServerPage(page, gateway);
    await page.getByLabel("Welcome message language").selectOption("de");
    await expect(page.getByLabel("Welcome message · Deutsch")).toHaveValue("Willkommen bei den Nachteulen");
    await page.getByLabel("Welcome message language").selectOption("en");
    await expect(page.getByLabel("Welcome message · English")).toHaveValue("Welcome, night owls");

    // A guest's page shows the text of its own language.
    await page.addInitScript(() => localStorage.setItem("webspeak:language", "de"));
    await page.goto(gateway.url);
    await expect(page.getByText("Willkommen bei den Nachteulen")).toBeVisible();
  });
});

test.describe("WebRTC", () => {
  test("switching it on names the ports to open, and the port range is locked while it is on", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    const webrtc = page.getByRole("checkbox", { name: /Enable WebRTC/ });
    const start = page.getByLabel("Start port");
    await expect(webrtc).not.toBeChecked();
    await expect(start).toBeEnabled();

    await webrtc.check();
    const notice = page.getByRole("dialog", { name: "Allow WebRTC ports first" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Ports must be opened: 40000–40099 (UDP)");
    await notice.getByRole("button", { name: "Got it" }).click();
    await expect(notice).toBeHidden();
    await expect(webrtc).toBeChecked();
    await expect(start).toBeDisabled();

    expect(await save(page)).toBe(200);
    await reloadServerPage(page, gateway);
    await expect(page.getByRole("checkbox", { name: /Enable WebRTC/ })).toBeChecked();
    await expect(page.getByLabel("Start port")).toBeDisabled();
  });

  test("with it off the range can be changed and kept, and an impossible range is refused", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await page.getByLabel("Start port").fill("41000");
    await page.getByLabel("End port").fill("41010");
    expect(await save(page)).toBe(200);
    await reloadServerPage(page, gateway);
    await expect(page.getByLabel("Start port")).toHaveValue("41000");
    await expect(page.getByLabel("End port")).toHaveValue("41010");

    await page.getByLabel("Start port").fill("42000");
    await page.getByLabel("End port").fill("41500");
    expect(await save(page)).toBe(400);
    await expect(page.getByRole("alert")).toContainText("The WebRTC UDP port range is invalid");
  });
});
