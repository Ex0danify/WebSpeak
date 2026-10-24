import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { pickServer, poll } from "../helpers";
import { GUEST_IDENTITY as GUEST } from "./identities";
import { channelIdOf } from "./ui";
import { TEST_ADMIN_PASSWORD, type Gateway } from "../../test/support/gateway";

// The admin console against the real server. Each test has a gateway of its own
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

const publicConfig = async (gateway: Gateway): Promise<{ accessMode: string; servers: Array<{ id: string; name: string }> }> =>
  (await gateway.request("/api/public-config")).json();

/** The edit dialog of the real server, which the dialog's own connection test then checks without saving anything. */
async function openRealServerDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Edit Real server" }).click();
  await expect(page.getByRole("dialog", { name: "Edit server" })).toBeVisible();
}

test.describe("test connection", () => {
  // The console's test sends the first packet of the TeamSpeak handshake to the voice port and waits for the answer
  // (`teamspeak-probe.ts`). It makes no TeamSpeak client, so it is not listed in a channel and cannot check the server
  // password.
  test("reports the real server's answer to the handshake, and the ping of its host", async ({ page, ownGateway, server }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/server");
    await openRealServerDialog(page);
    await expect(page.getByLabel("TeamSpeak server address")).toHaveValue(server.host);
    await expect(page.getByLabel("Voice port")).toHaveValue(String(server.voicePort));

    const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/server/test"));
    await page.getByRole("button", { name: "Test connection" }).click();
    expect(await (await answer).json()).toMatchObject({
      ok: true,
      latencyMs: expect.any(Number),
      hostPing: { ok: true, packetLossPercent: 0, attempts: 4, successfulAttempts: 4 },
    });
    await expect(page.getByText("TeamSpeak server answered")).toBeVisible();
    await expect(page.getByText(/ · [\d.]+ ms · Host ping [\d.]+ ms · Packet loss 0%$/)).toBeVisible();
  });

  // The probe checks the port, not just the host, so a voice port with nothing behind it must fail (the host answers ping, the
  // port doesn't).
  test("fails for a voice port that nothing listens on, although the host answers ping", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/server");
    await openRealServerDialog(page);
    await page.getByLabel("Voice port").fill("1");
    const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/server/test"));
    await page.getByRole("button", { name: "Test connection" }).click();
    // Nothing on UDP port 1 of the loopback address: the host answers "port unreachable" (refused),
    // or, behind a firewall that drops instead, stays silent.
    expect(await (await answer).json()).toMatchObject({
      ok: false,
      errorCode: expect.stringMatching(/^(CONNECTION_REFUSED|NO_ANSWER)$/),
      hostPing: { ok: true, successfulAttempts: 4 },
    });
    await expect(page.getByText("TeamSpeak server answered")).toBeHidden();
    await expect(page.getByText(/Host ping [\d.]+ ms · Packet loss 0%$/)).toBeVisible();
  });

  test("reports a host that does not answer as a failure", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openAdmin(page, gateway, "/server");
    await openRealServerDialog(page);
    // 192.0.2.0/24 is reserved for documentation (TEST-NET-1): nothing answers there, neither ping
    // nor the handshake (which is silent, or refused by a router that has no route).
    await page.getByLabel("TeamSpeak server address").fill("192.0.2.1");
    const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/server/test"));
    await page.getByRole("button", { name: "Test connection" }).click();
    expect(await (await answer).json()).toMatchObject({
      ok: false,
      errorCode: expect.stringMatching(/^(NO_ANSWER|UNREACHABLE|CONNECTION_REFUSED)$/),
      hostPing: { ok: false, successfulAttempts: 0, packetLossPercent: 100 },
    });
    await expect(page.getByText("TeamSpeak server answered")).toBeHidden();
    await expect(page.getByText(/The host does not answer ping/)).toBeVisible();
  });
});

test("guest access set in the console reaches the guests, and a guest still joins the real server after it is set back", async ({
  page,
  person,
  ownGateway,
  query,
}) => {
  const gateway = await ownGateway();
  expect(await publicConfig(gateway)).toMatchObject({ accessMode: "fixed", servers: [{ name: "Real server" }] });
  await openAdmin(page, gateway, "/server");
  // The console saves a choice by itself.
  const choose = async (name: RegExp) => {
    const answer = page.waitForResponse(
      (response) => response.url().endsWith("/api/admin/server") && response.request().method() === "PUT",
    );
    await page.getByRole("radio", { name }).click();
    expect((await answer).status()).toBe(200);
  };

  await choose(/Also allow other TeamSpeak servers/);
  expect(await publicConfig(gateway)).toMatchObject({ accessMode: "open" });
  const guest = await person(GUEST, "admin-open", { gateway });
  await guest.page.goto("/");
  await pickServer(guest.page, "Other server…");
  await expect(guest.page.getByLabel("TeamSpeak server address")).toBeVisible();

  await choose(/Only the configured servers/);
  expect(await publicConfig(gateway)).toMatchObject({ accessMode: "fixed" });
  await guest.join();
  expect(await channelIdOf(query, guest.nickname)).toBeDefined();
});

test("Terminate in the console removes a real client from the server", async ({ page, person, ownGateway, query }) => {
  const gateway = await ownGateway();
  const guest = await person(GUEST, "admin-victim", { gateway });
  await guest.join();
  await poll(
    () => channelIdOf(query, guest.nickname),
    (cid) => cid !== undefined,
    { message: "the server to list the guest" },
  );

  await openAdmin(page, gateway, "/operations");
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .locator("table")
    .first()
    .getByRole("row")
    .filter({ hasText: guest.nickname })
    .getByRole("button", { name: "Terminate" })
    .click();

  await expect(guest.page.getByRole("button", { name: "Enter voice space" })).toBeVisible();
  await poll(
    () => channelIdOf(query, guest.nickname),
    (cid) => cid === undefined,
    { message: "the server to drop the terminated guest's client" },
  );
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("There are no active sessions.")).toBeVisible();
});
