import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../test/helpers/gateway";
import { TeamSpeakProbeError } from "../src/server/teamspeak-probe";

// The admin console's Server page: what the administrator edits, what a save keeps, and what the
// guests then see. Each test has a gateway of its own (`ownGateway`), the console is asked for English.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("webspeak:language", "en"));
});

/** Signs in and opens the Server page. */
async function openServerPage(page: Page, gateway: Gateway): Promise<void> {
  await page.goto(`${gateway.url}/admin/login`);
  await page.getByLabel("Admin username").fill("admin");
  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await reloadServerPage(page, gateway);
}

async function reloadServerPage(page: Page, gateway: Gateway): Promise<void> {
  await page.goto(`${gateway.url}/admin/server`);
  await expect(page.getByRole("heading", { name: "Server settings" })).toBeVisible();
}

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
  test("keeps what was edited across a reload, and saving the old values restores them", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    const original = { address: await page.getByLabel("TeamSpeak server address").inputValue(), port: await page.getByLabel("Voice port").inputValue(), site: await siteName(page).inputValue() };

    await page.getByLabel("TeamSpeak server address").fill("ts.example.test");
    await page.getByLabel("Voice port").fill("9988");
    await siteName(page).fill("Night Owls");
    expect(await save(page)).toBe(200);
    await reloadServerPage(page, gateway);
    await expect(page.getByLabel("TeamSpeak server address")).toHaveValue("ts.example.test");
    await expect(page.getByLabel("Voice port")).toHaveValue("9988");
    await expect(siteName(page)).toHaveValue("Night Owls");

    await page.getByLabel("TeamSpeak server address").fill(original.address);
    await page.getByLabel("Voice port").fill(original.port);
    await siteName(page).fill(original.site);
    expect(await save(page)).toBe(200);
    await reloadServerPage(page, gateway);
    await expect(page.getByLabel("TeamSpeak server address")).toHaveValue(original.address);
    await expect(page.getByLabel("Voice port")).toHaveValue(original.port);
    await expect(siteName(page)).toHaveValue(original.site);
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
    const fixed = page.getByRole("radio", { name: /Only this TeamSpeak server/ });
    const open = page.getByRole("radio", { name: /Allow other TeamSpeak servers/ });
    await expect(fixed).toBeChecked();
    await open.click();
    await expect(open).toBeChecked();
    await expect(fixed).not.toBeChecked();
    expect(await save(page)).toBe(200);
    await reloadServerPage(page, gateway);
    await expect(page.getByRole("radio", { name: /Allow other TeamSpeak servers/ })).toBeChecked();
  });

  test("a refused setting is shown as an alert, and nothing is kept", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await page.getByLabel("TeamSpeak server address").fill("");
    expect(await save(page)).toBe(400);
    await expect(page.getByRole("alert")).toBeVisible();
    await reloadServerPage(page, gateway);
    await expect(page.getByLabel("TeamSpeak server address")).not.toHaveValue("");
  });

  // Every successful action of the console says so in a toast (bug F29: a save that worked said nothing).
  test("a successful save says so in a toast, and a refused one shows the alert and no toast (F29)", async ({ page, ownGateway }) => {
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
    await page.getByLabel("TeamSpeak server address").fill("");
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

test.describe("connection test", () => {
  test("Test connection shows the handshake's answer and the host ping, for the address in the form", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await page.getByLabel("TeamSpeak server address").fill("probe.example.test");
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("TeamSpeak server answered")).toBeVisible();
    await expect(page.getByText(/ · 12 ms · Host ping 3 ms · Packet loss 0%$/)).toBeVisible();
    expect(JSON.stringify(gateway.probe.mock.calls)).toContain("probe.example.test");
    expect(gateway.ping.mock.calls).toEqual([["probe.example.test"]]);
  });

  test("a silent voice port is a failure, and the banner still says whether the host answers ping", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.probe.mockRejectedValue(new TeamSpeakProbeError("NO_ANSWER", "silent"));
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("No answer from the TeamSpeak server")).toBeVisible();
    await expect(page.getByText(/Nothing answered on this voice port\..* · Host ping 3 ms · Packet loss 0%$/)).toBeVisible();
    await expect(page.getByText("TeamSpeak server answered")).toBeHidden();
  });

  test("a host that ignores ping does not fail a port that answers", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.ping.mockResolvedValue({ ok: false, latencyMs: null, packetLossPercent: 100, attempts: 4, successfulAttempts: 0, samples: [], errorCode: "TIMEOUT" });
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("TeamSpeak server answered")).toBeVisible();
    await expect(page.getByText(/ · The host does not answer ping$/)).toBeVisible();
  });

  test("the test sends only the address: the server password is not part of it", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await page.getByRole("radio", { name: "Change" }).click();
    await page.getByRole("textbox", { name: "Server password" }).fill("typed-secret");
    const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/admin/server/test"));
    await page.getByRole("button", { name: "Test connection" }).click();
    expect(JSON.parse((await request).postData() ?? "{}")).toEqual({ target: expect.stringContaining(":") });
    await expect(page.getByText("TeamSpeak server answered")).toBeVisible();
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
