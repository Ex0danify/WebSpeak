import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openServerPage, reloadServerPage } from "./helpers/admin";
import { serverOptions } from "./helpers";
import { TeamSpeakProbeError } from "../src/modules/teamspeak/teamSpeakProbe";

// The server list of the admin console's Server page: adding, changing and removing servers, the status dot of each and the
// connection test of the dialog. Each test has a gateway of its own (`ownGateway`), the console is asked for English.

const row = (page: Page, name: string): Locator => page.locator(".server-row").filter({ hasText: name });
const dialog = (page: Page, name: string): Locator => page.getByRole("dialog", { name });
const toast = (page: Page, text: string): Locator => page.locator("li").filter({ hasText: text });

/** Fills the add/edit dialog with a name and an address, the port is left alone unless given. */
async function fillServer(page: Page, name: string, address: string, port?: string): Promise<void> {
  await page.getByLabel("Server name").fill(name);
  await page.getByLabel("TeamSpeak server address").fill(address);
  if (port) await page.getByLabel("Voice port").fill(port);
}

test.describe("the list", () => {
  test("starts with the default server, checked on every visit", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    const first = row(page, "WebSpeak");
    await expect(first).toHaveCount(1);
    await expect(first).toContainText("127.0.0.1:9987");
    await expect(first).toContainText("Online");
    expect(JSON.stringify(gateway.probe.mock.calls)).toContain("127.0.0.1");
  });

  test("shows a silent server as unreachable and a password protected one as such", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test:9988", serverPassword: "s3cret" });
    gateway.probe.mockImplementation(async (target) => {
      if (target.host === "clan.example.test") throw new TeamSpeakProbeError("NO_ANSWER", "silent");
      return { ok: true, latencyMs: 12 };
    });
    await openServerPage(page, gateway);
    await expect(row(page, "Clan")).toContainText("Unreachable");
    await expect(row(page, "Clan")).toContainText("Password protected");
    await expect(row(page, "Clan")).toContainText("clan.example.test:9988");
    await expect(row(page, "WebSpeak")).toContainText("Online");
    await expect(row(page, "WebSpeak")).not.toContainText("Password protected");
    expect(JSON.stringify(await page.content())).not.toContain("s3cret");
  });

  test("shows a server as checking while its probe is still running", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    let release: () => void = () => {};
    gateway.probe.mockImplementation(() => new Promise((resolve) => (release = () => resolve({ ok: true, latencyMs: 5 }))));
    await openServerPage(page, gateway);
    await expect(row(page, "WebSpeak")).toContainText("Checking");
    release();
    await expect(row(page, "WebSpeak")).toContainText("Online");
  });
});

test.describe("adding a server", () => {
  test("the dialog tests the address, then adds the server, which the guests see by name only", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Add server" }).click();
    const add = dialog(page, "Add server");
    await expect(add).toBeVisible();
    await fillServer(page, "Clan", "probe.example.test", "9988");
    await page.getByLabel("Server password").fill("typed-secret");

    const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/admin/server/test"));
    await add.getByRole("button", { name: "Test connection" }).click();
    expect(JSON.parse((await request).postData() ?? "{}")).toEqual({ target: "probe.example.test:9988" });
    await expect(add.getByText("TeamSpeak server answered")).toBeVisible();
    await expect(add.getByText(/ · 12 ms · Host ping 3 ms · Packet loss 0%$/)).toBeVisible();
    expect(JSON.stringify(gateway.probe.mock.calls)).not.toContain("typed-secret");
    expect(gateway.adminService.listServers()).toHaveLength(1);

    await add.getByRole("button", { name: "Save" }).click();
    await expect(add).toBeHidden();
    await expect(toast(page, "Server added.")).toBeVisible();
    await expect(row(page, "Clan")).toContainText("probe.example.test:9988");
    await expect(row(page, "Clan")).toContainText("Password protected");
    await expect(row(page, "Clan")).toContainText("Online");

    await reloadServerPage(page, gateway);
    await expect(row(page, "Clan")).toHaveCount(1);
    const config = JSON.stringify(await (await gateway.request("/api/public-config")).json());
    expect(config).toContain("Clan");
    expect(config).not.toContain("probe.example.test");
  });

  test("a silent address is reported in the dialog without blocking the save", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.probe.mockRejectedValue(new TeamSpeakProbeError("NO_ANSWER", "silent"));
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Add server" }).click();
    const add = dialog(page, "Add server");
    await fillServer(page, "Quiet", "quiet.example.test");
    await add.getByRole("button", { name: "Test connection" }).click();
    await expect(add.getByText("No answer from the TeamSpeak server")).toBeVisible();
    await expect(add.getByText(/Nothing answered on this voice port\..* · Host ping 3 ms · Packet loss 0%$/)).toBeVisible();
    await add.getByRole("button", { name: "Save" }).click();
    await expect(row(page, "Quiet")).toContainText("Unreachable");
  });

  test("a refused entry stays in the dialog with the reason, and the list is untouched", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Add server" }).click();
    const add = dialog(page, "Add server");
    await fillServer(page, "webspeak", "other.example.test");
    await add.getByRole("button", { name: "Save" }).click();
    await expect(add.getByRole("alert")).toContainText("Another server already uses this name.");
    await fillServer(page, "Other", "not a target:::");
    await add.getByRole("button", { name: "Save" }).click();
    await expect(add.getByRole("alert")).toContainText("The TeamSpeak server address is invalid.");
    await add.getByRole("button", { name: "Cancel" }).click();
    await expect(add).toBeHidden();
    await expect(page.locator(".server-row")).toHaveCount(1);
  });

  test("the dialog closes on Escape and the next one starts empty", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Add server" }).click();
    await fillServer(page, "Draft", "draft.example.test");
    await page.keyboard.press("Escape");
    await expect(dialog(page, "Add server")).toBeHidden();
    await expect(page.getByRole("button", { name: "Add server" })).toBeFocused();
    await page.getByRole("button", { name: "Add server" }).click();
    await expect(page.getByLabel("Server name")).toHaveValue("");
  });
});

test.describe("changing a server", () => {
  test("keeps the saved password unless it is changed, and says so in a toast", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    const clan = gateway.adminService.createServer({ name: "Clan", target: "clan.example.test:9988", serverPassword: "s3cret" });
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Edit Clan" }).click();
    const edit = dialog(page, "Edit server");
    await expect(page.getByLabel("Server name")).toHaveValue("Clan");
    await expect(page.getByLabel("TeamSpeak server address")).toHaveValue("clan.example.test");
    await expect(page.getByLabel("Voice port")).toHaveValue("9988");
    await expect(page.getByRole("radio", { name: "Keep" })).toBeChecked();
    await page.getByLabel("Server name").fill("Clan EU");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Server saved.")).toBeVisible();
    await expect(row(page, "Clan EU")).toContainText("Password protected");
    expect(gateway.adminService.resolveServer(clan.id)?.serverPassword).toBe("s3cret");

    await page.getByRole("button", { name: "Edit Clan EU" }).click();
    await edit.getByRole("radio", { name: "Remove" }).click();
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(row(page, "Clan EU")).not.toContainText("Password protected");
    expect(gateway.adminService.resolveServer(clan.id)?.serverPassword).toBe("");
  });

  test("moving a server to another address checks it again", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    gateway.probe.mockClear();
    await page.getByRole("button", { name: "Edit WebSpeak" }).click();
    await page.getByLabel("TeamSpeak server address").fill("moved.example.test");
    await dialog(page, "Edit server").getByRole("button", { name: "Save" }).click();
    await expect(row(page, "WebSpeak")).toContainText("moved.example.test:9987");
    await expect.poll(() => JSON.stringify(gateway.probe.mock.calls)).toContain("moved.example.test");
  });
});

test.describe("removing a server", () => {
  test("asks first, then removes it and says so in a toast", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test" });
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Remove Clan" }).click();
    const confirm = page.getByRole("dialog", { name: "Remove server" });
    await expect(confirm).toContainText("Remove “Clan”?");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(row(page, "Clan")).toHaveCount(1);

    await page.getByRole("button", { name: "Remove Clan" }).click();
    await confirm.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(toast(page, "Server “Clan” removed.")).toBeVisible();
    await expect(row(page, "Clan")).toHaveCount(0);
    await reloadServerPage(page, gateway);
    await expect(page.locator(".server-row")).toHaveCount(1);
  });

  test("the last server stays while guests may only use the list", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Remove WebSpeak" }).click();
    await page.getByRole("dialog", { name: "Remove server" }).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Keep at least one server while access is limited to the server list.");
    await expect(row(page, "WebSpeak")).toHaveCount(1);
  });

  test("an invite for a removed server stops working", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    const clan = gateway.adminService.createServer({ name: "Clan", target: "clan.example.test" });
    const { token } = gateway.adminService.createManagedInvite({ serverId: clan.id, channel: "", expiresInHours: 1, maxUses: 0 });
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Remove Clan" }).click();
    await page.getByRole("dialog", { name: "Remove server" }).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(row(page, "Clan")).toHaveCount(0);
    const response = await gateway.request("/api/join-ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: "late", invite: token }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVITE_INVALID" });
  });
});

test.describe("keyboard", () => {
  test("the list is reachable and operable without a mouse", async ({ page, ownGateway, isMobile }) => {
    test.skip(isMobile, "no keyboard on a phone");
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Add server" }).focus();
    await page.keyboard.press("Enter");
    const add = dialog(page, "Add server");
    await expect(add).toBeVisible();
    await expect(page.getByLabel("Server name")).toBeFocused();
    await page.keyboard.type("Keys");
    await page.keyboard.press("Tab");
    await page.keyboard.type("keys.example.test");
    await page.keyboard.press("Enter");
    await expect(row(page, "Keys")).toBeVisible();
  });
});

test.describe("order", () => {
  const names = async (page: Page) => (await page.locator(".server-row strong").allTextContents()).map((text) => text.trim());

  test("a server picked up with the keyboard moves with the arrows and is saved on drop, in the guests' dropdown too", async ({
    page,
    ownGateway,
    isMobile,
  }) => {
    test.skip(isMobile, "a phone moves a server with the buttons");
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test" });
    gateway.adminService.createServer({ name: "LAN party", target: "lan.example.test" });
    await openServerPage(page, gateway);
    expect(await names(page)).toEqual(["WebSpeak", "Clan", "LAN party"]);

    const handle = page.getByRole("button", { name: "Reorder LAN party" });
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(handle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(handle).toBeFocused();
    await expect(page.getByText("LAN party moved to position 1 of 3.")).toBeAttached();
    expect(gateway.adminService.listServers()[0]!.name).toBe("WebSpeak");
    await page.keyboard.press("Space");
    await expect(toast(page, "Server order saved.")).toBeVisible();
    expect(await names(page)).toEqual(["LAN party", "WebSpeak", "Clan"]);

    await reloadServerPage(page, gateway);
    expect(await names(page)).toEqual(["LAN party", "WebSpeak", "Clan"]);
    await page.goto(`${gateway.url}/`);
    await page.getByLabel("Your nickname").fill("order-check");
    expect(await serverOptions(page)).toEqual(["LAN party", "WebSpeak", "Clan"]);
  });

  test("Escape puts a picked up server back, and nothing is saved", async ({ page, ownGateway, isMobile }) => {
    test.skip(isMobile, "a phone moves a server with the buttons");
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test" });
    await openServerPage(page, gateway);
    await page.getByRole("button", { name: "Reorder Clan" }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    expect(await names(page)).toEqual(["Clan", "WebSpeak"]);
    await page.keyboard.press("Escape");
    expect(await names(page)).toEqual(["WebSpeak", "Clan"]);
    expect(gateway.adminService.listServers().map((server) => server.name)).toEqual(["WebSpeak", "Clan"]);
  });

  test("a server dragged onto another takes its place and the order is kept", async ({ page, ownGateway, isMobile }) => {
    test.skip(isMobile, "a phone moves a server with the buttons");
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test" });
    await openServerPage(page, gateway);
    await row(page, "Clan").dragTo(row(page, "WebSpeak"));
    await expect(toast(page, "Server order saved.")).toBeVisible();
    expect(await names(page)).toEqual(["Clan", "WebSpeak"]);
    expect(gateway.adminService.listServers().map((server) => server.name)).toEqual(["Clan", "WebSpeak"]);
  });

  test("a phone moves a server one step with the buttons", async ({ page, ownGateway, isMobile }) => {
    test.skip(!isMobile, "the buttons are for touch");
    const gateway = await ownGateway();
    gateway.adminService.createServer({ name: "Clan", target: "clan.example.test" });
    await openServerPage(page, gateway);
    await expect(page.getByRole("button", { name: "Move WebSpeak up" })).toBeDisabled();
    await page.getByRole("button", { name: "Move Clan up" }).click();
    await expect(toast(page, "Server order saved.")).toBeVisible();
    expect(await names(page)).toEqual(["Clan", "WebSpeak"]);
  });

  test("a single server has nothing to reorder", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openServerPage(page, gateway);
    await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(0);
  });
});
