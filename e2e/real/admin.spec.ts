import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { poll } from "../helpers";
import { GUEST_IDENTITY as GUEST } from "./identities";
import { channelIdOf } from "./ui";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../../test/helpers/gateway";

// Step 5.9: the admin console against the real server. Each test has a gateway of its own
// (`ownGateway`), because it changes the settings or ends a session. The console is asked for English.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("webspeak:language", "en"));
});

async function openAdmin(page: Page, gateway: Gateway, path: "/server" | "/operations"): Promise<void> {
  await page.goto(`${gateway.url}/admin/login`);
  await page.getByLabel("Admin username").fill("admin");
  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await page.goto(`${gateway.url}/admin${path}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

const publicConfig = async (gateway: Gateway): Promise<{ accessMode: string; target: string }> => (await gateway.request("/api/public-config")).json();

test.describe("test connection", () => {
  // The console's test is a ping of the host from the gateway's machine; it makes no TeamSpeak client
  // (`admin-service.ts`), and the server's UDP port is not what it measures. The disposable server's
  // ports are published on 127.0.0.1, so this shows the real check (the product's own probe, see
  // `startGateway`) running for the target the settings point at, and how it reports a host that
  // does not answer.
  test("reports a ping of the address the settings point at", async ({ page, ownGateway, server }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/server");
    await expect(page.getByLabel("TeamSpeak server address")).toHaveValue(server.host);
    await expect(page.getByLabel("Voice port")).toHaveValue(String(server.voicePort));

    const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/server/test"));
    await page.getByRole("button", { name: "Test connection" }).click();
    expect(await (await answer).json()).toMatchObject({ ok: true, checkType: "network", packetLossPercent: 0, attempts: 4, successfulAttempts: 4 });
    await expect(page.getByText(/^Ping succeeded\..* · [\d.]+ ms · Packet loss 0%$/)).toBeVisible();
  });

  // F38 (docs/testing/findings.md): the test is a host ping and never looks at the port, so a
  // voice port with nothing behind it passes. Pinned as it is; a real check would turn this red.
  test("F38: passes for a voice port that nothing listens on, because only the host is pinged", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/server");
    await page.getByLabel("Voice port").fill("1");
    const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/server/test"));
    await page.getByRole("button", { name: "Test connection" }).click();
    expect(await (await answer).json()).toMatchObject({ ok: true, checkType: "network", successfulAttempts: 4 });
    await expect(page.getByText("Network reachable (password not verified)")).toBeVisible();
  });

  test("reports a host that does not answer as a failure", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/server");
    // 192.0.2.0/24 is reserved for documentation (TEST-NET-1): nothing answers there.
    await page.getByLabel("TeamSpeak server address").fill("192.0.2.1");
    const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/server/test"));
    await page.getByRole("button", { name: "Test connection" }).click();
    expect(await (await answer).json()).toMatchObject({ ok: false, checkType: "network", successfulAttempts: 0 });
    await expect(page.getByText(/Ping succeeded/)).toBeHidden();
    await expect(page.getByText(/Packet loss 100%/)).toBeVisible();
  });
});

test("guest access set in the console reaches the guests, and a guest still joins the real server after it is set back", async ({ page, person, ownGateway, server, query }) => {
  const gateway = await ownGateway();
  expect(await publicConfig(gateway)).toMatchObject({ accessMode: "fixed", target: `${server.host}:${server.voicePort}` });
  await openAdmin(page, gateway, "/server");
  const save = async () => {
    const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/server") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Save changes" }).click();
    expect((await answer).status()).toBe(200);
  };

  await page.getByRole("radio", { name: /Allow other TeamSpeak servers/ }).click();
  await save();
  expect(await publicConfig(gateway)).toMatchObject({ accessMode: "open" });
  const guest = await person(GUEST, "admin-open", { gateway });
  await guest.page.goto("/");
  await expect(guest.page.getByLabel("TeamSpeak server address")).toBeVisible();

  await page.getByRole("radio", { name: /Only this TeamSpeak server/ }).click();
  await save();
  expect(await publicConfig(gateway)).toMatchObject({ accessMode: "fixed" });
  await guest.join();
  expect(await channelIdOf(query, guest.nickname)).toBeDefined();
});

test("Terminate in the console removes a real client from the server", async ({ page, person, ownGateway, query }) => {
  const gateway = await ownGateway();
  const guest = await person(GUEST, "admin-victim", { gateway });
  await guest.join();
  await poll(() => channelIdOf(query, guest.nickname), (cid) => cid !== undefined, { message: "the server to list the guest" });

  await openAdmin(page, gateway, "/operations");
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("table").first().getByRole("row").filter({ hasText: guest.nickname }).getByRole("button", { name: "Terminate" }).click();

  await expect(guest.page.getByRole("button", { name: "Enter voice space" })).toBeVisible();
  await poll(() => channelIdOf(query, guest.nickname), (cid) => cid === undefined, { message: "the server to drop the terminated guest's client" });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("There are no active sessions.")).toBeVisible();
});
