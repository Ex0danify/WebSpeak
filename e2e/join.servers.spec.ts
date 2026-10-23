import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectInRoom, pickServer, serverOptions, serverPicker } from "./helpers";
import type { Gateway } from "../test/support/gateway";

// The server choice of the join form: the configured servers by name, the typed address that open access adds, and what the
// page may know about either. Each test has a gateway of its own (`ownGateway`).

const joinButton = (page: Page) => page.getByRole("button", { name: "Enter voice space" });

/** The bodies of the join tickets the page asks for. */
function joinTicketBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/join-ticket")) bodies.push(request.postDataJSON());
  });
  return bodies;
}

async function openJoinPage(page: Page, gateway: Gateway, nickname: string): Promise<void> {
  await page.goto(`${gateway.url}/`);
  await page.getByLabel("Your nickname").fill(nickname);
}

test.describe("fixed access", () => {
  test("a single server needs no choice", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openJoinPage(page, gateway, "pick-single");
    await expect(joinButton(page)).toBeEnabled();
    await expect(serverPicker(page)).toHaveCount(0);
    await expect(page.getByLabel("TeamSpeak server address")).toHaveCount(0);
  });

  test("several servers are offered by name, and the page never learns their addresses", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test:9988", serverPassword: "s3cret" });
    gateway.adminService.createServer({ name: "LAN party", target: "192.168.1.20:9987" });
    const bodies = joinTicketBodies(page);
    await openJoinPage(page, gateway, "pick-several");
    expect(await serverOptions(page)).toEqual(["WebSpeak", "Clan", "LAN party"]);
    await expect(serverPicker(page)).toContainText("WebSpeak");
    await expect(page.getByLabel("TeamSpeak server address")).toHaveCount(0);

    await pickServer(page, "LAN party");
    await joinButton(page).click();
    await expectInRoom(page, "pick-several");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ serverId: expect.stringMatching(/^server-/) });
    expect(bodies[0]).not.toHaveProperty("target");
    const html = await page.content();
    for (const hidden of ["clan.example.test", "192.168.1.20", "s3cret"]) expect(html).not.toContain(hidden);
  });

  test("a loopback server of the administrator is joined like any other", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "This machine", target: "127.0.0.1:9988" });
    await openJoinPage(page, gateway, "pick-loopback");
    await pickServer(page, "This machine");
    await joinButton(page).click();
    await expectInRoom(page, "pick-loopback");
  });

  test("the saved password of a server is used, and a wrong one asks the guest", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.ts.serverPassword = "s3cret";
    gateway.adminService.createServer({ name: "Good", target: "good.example.test", serverPassword: "s3cret" });
    gateway.adminService.createServer({ name: "Bad", target: "bad.example.test", serverPassword: "outdated" });
    await openJoinPage(page, gateway, "pick-password");
    await pickServer(page, "Good");
    await joinButton(page).click();
    await expectInRoom(page, "pick-password");

    await page.goto(`${gateway.url}/`);
    await page.getByLabel("Your nickname").fill("pick-password-2");
    await pickServer(page, "Bad");
    await joinButton(page).click();
    await expect(page.getByRole("dialog", { name: "Server password required" })).toBeVisible();
  });

  test("an address in the link is ignored, the list is all there is", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await page.goto(`${gateway.url}/?server=evil.example.test%3A9987`);
    await expect(page.getByLabel("TeamSpeak server address")).toHaveCount(0);
    await page.getByLabel("Your nickname").fill("pick-link");
    await expect(joinButton(page)).toBeEnabled();
  });
});

test.describe("open access", () => {
  test("offers the typed address next to the configured servers", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.updateSettings({ accessMode: "open", siteName: "WebSpeak", webRtcEnabled: false });
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test" });
    await openJoinPage(page, gateway, "open-typed");
    expect(await serverOptions(page)).toEqual(["WebSpeak", "Clan", "Other server…"]);
    await expect(page.getByLabel("TeamSpeak server address")).toHaveCount(0);

    await pickServer(page, "Other server…");
    await expect(page.getByLabel("TeamSpeak server address")).toBeVisible();
    await expect(page.getByLabel("Voice port")).toBeVisible();
    await pickServer(page, "Clan");
    await expect(page.getByLabel("TeamSpeak server address")).toHaveCount(0);
  });

  test("a typed loopback address is refused while the administrator's loopback server is not", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.updateSettings({ accessMode: "open", siteName: "WebSpeak", webRtcEnabled: false });
    await openJoinPage(page, gateway, "open-guard");
    await joinButton(page).click();
    await expectInRoom(page, "open-guard");

    await page.goto(`${gateway.url}/`);
    await page.getByLabel("Your nickname").fill("open-guard-2");
    await pickServer(page, "Other server…");
    await page.getByLabel("TeamSpeak server address").fill("127.0.0.1");
    await joinButton(page).click();
    await expect(page.getByRole("alert")).toContainText("This TeamSpeak server address is not allowed");
  });

  test("without any configured server the typed address is all there is", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.updateSettings({ accessMode: "open", siteName: "WebSpeak", webRtcEnabled: false });
    gateway.adminService.removeServer("server-default");
    await page.goto(`${gateway.url}/`);
    await expect(serverPicker(page)).toHaveCount(0);
    await expect(page.getByLabel("TeamSpeak server address")).toBeVisible();
  });

  test("sends a typed public address as the target and no server id", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.updateSettings({ accessMode: "open", siteName: "WebSpeak", webRtcEnabled: false });
    const bodies = joinTicketBodies(page);
    await openJoinPage(page, gateway, "open-public");
    await pickServer(page, "Other server…");
    await page.getByLabel("TeamSpeak server address").fill("1.1.1.1");
    await joinButton(page).click();
    await expectInRoom(page, "open-public");
    expect(bodies[0]).toMatchObject({ target: "1.1.1.1:9987" });
    expect(bodies[0]).not.toHaveProperty("serverId");
  });
});
