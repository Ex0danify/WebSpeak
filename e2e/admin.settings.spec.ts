import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openGatewayPage, openWebPage, reloadGatewayPage, reloadWebPage } from "./helpers/admin";
import type { Gateway } from "../test/support/gateway";

// The admin console's Gateway and Web pages: what the administrator edits, what a save keeps, and what the
// guests then see. Each test has a gateway of its own (`ownGateway`), the console is asked for English.

/** Makes a change and returns the gateway's answer to the save it sets off: there is no Save button, the console saves by itself. */
async function saves(page: Page, change: () => Promise<unknown>): Promise<number> {
  const answer = page.waitForResponse((response) => response.url().endsWith("/api/admin/server") && response.request().method() === "PUT");
  await change();
  return (await answer).status();
}

/** Types into a text or number field and leaves it, which is what saves it. */
async function typeInto(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.blur();
}

const saved = (page: Page): Locator => page.getByRole("status").filter({ hasText: "Saved" });

const siteName = (page: Page): Locator => page.getByLabel("Site display name");
/** What the guests' page is told about the site. */
const publicConfig = async (gateway: Gateway): Promise<Record<string, unknown>> => (await gateway.request("/api/public-config")).json();

test.describe("save", () => {
  test("keeps what was edited across a reload, and saving the old value restores it", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openWebPage(page, gateway);
    const original = await siteName(page).inputValue();

    expect(await saves(page, () => typeInto(siteName(page), "Night Owls"))).toBe(200);
    await reloadWebPage(page, gateway);
    await expect(siteName(page)).toHaveValue("Night Owls");

    expect(await saves(page, () => typeInto(siteName(page), original))).toBe(200);
    await reloadWebPage(page, gateway);
    await expect(siteName(page)).toHaveValue(original);
  });

  test("the site name reaches the guests' page", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openWebPage(page, gateway);
    expect(await saves(page, () => typeInto(siteName(page), "Night Owls Voice"))).toBe(200);
    expect(JSON.stringify(await publicConfig(gateway))).toContain("Night Owls Voice");
  });

  test("the guest access mode is a choice of two, and the choice is kept", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openGatewayPage(page, gateway);
    const fixed = page.getByRole("radio", { name: /Only the configured servers/ });
    const open = page.getByRole("radio", { name: /Also allow other TeamSpeak servers/ });
    await expect(fixed).toBeChecked();
    expect(await saves(page, () => open.click())).toBe(200);
    await expect(open).toBeChecked();
    await expect(fixed).not.toBeChecked();
    await reloadGatewayPage(page, gateway);
    await expect(page.getByRole("radio", { name: /Also allow other TeamSpeak servers/ })).toBeChecked();
  });

  test("a value that is not valid yet is not sent, says why and keeps what was typed", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openWebPage(page, gateway);
    const original = await siteName(page).inputValue();
    let sent = 0;
    page.on("request", (request) => void (request.method() === "PUT" && request.url().endsWith("/api/admin/server") && sent++));

    await typeInto(siteName(page), "");
    await expect(page.getByText("Not saved: enter 1 to 80 characters.")).toBeVisible();
    await expect(siteName(page)).toHaveAttribute("aria-invalid", "true");
    await expect(siteName(page)).toHaveValue("");
    expect(sent).toBe(0);

    // Another field still saves, and the one that is not valid yet stays as it was.
    expect(await saves(page, () => typeInto(page.getByLabel(/^Welcome message · /), "Kept anyway"))).toBe(200);
    await expect(siteName(page)).toHaveValue("");
    await reloadWebPage(page, gateway);
    await expect(siteName(page)).toHaveValue(original);

    await typeInto(siteName(page), "Fixed up");
    await expect(page.getByText("Not saved: enter 1 to 80 characters.")).toHaveCount(0);
  });

  test("a setting the gateway refuses shows an alert in its section, and a good save takes it away", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openGatewayPage(page, gateway);
    const fixed = page.getByRole("radio", { name: /Only the configured servers/ });
    const open = page.getByRole("radio", { name: /Also allow other TeamSpeak servers/ });
    expect(await saves(page, () => open.click())).toBe(200);
    await page.getByRole("button", { name: "Remove WebSpeak" }).click();
    await page.getByRole("dialog", { name: "Remove server" }).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.locator(".server-row")).toHaveCount(0);

    expect(await saves(page, () => fixed.click())).toBe(400);
    await expect(page.getByRole("alert")).toContainText("Keep at least one server while access is limited to the server list.");
    await expect(fixed).toBeChecked();
    await expect(saved(page).getByText("Saved")).toHaveCount(0);

    // Back to what the gateway keeps: nothing is left to refuse, so nothing is sent and the alert goes.
    await open.click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("a save says Saved next to the section title, with no toast and no button, and it fades", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openWebPage(page, gateway);
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    const identity = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Site identity" }) });
    const sectionStatus = identity.getByRole("status");
    const fieldSaid = identity.locator("label").filter({ hasText: "Site display name" }).getByText("Saved");
    await expect(identity.getByRole("status")).toBeAttached();
    await expect(identity.getByText("Saved")).toHaveCount(0);

    expect(await saves(page, () => typeInto(siteName(page), "Quiet Save"))).toBe(200);
    // The section's status is for a screen reader, the field's mark is what is seen.
    await expect(sectionStatus).toHaveText("Saved");
    // The field that was saved is marked next to its label, where the person is looking, and no other field is.
    await expect(fieldSaid).toBeVisible();
    await expect(identity.getByText("Saved")).toHaveCount(2);
    await expect(page.locator("li").filter({ hasText: "Settings saved." })).toHaveCount(0);
    await expect(identity.getByText("Saved")).toHaveCount(0, { timeout: 8000 });
  });
});

test.describe("welcome message", () => {
  test("has one text per language, each kept, and the guests get the one for their language", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openWebPage(page, gateway);
    const language = page.getByLabel("Welcome message language");
    await language.selectOption("de");
    await expect(page.getByLabel("Welcome message · Deutsch")).toBeVisible();
    expect(await saves(page, () => typeInto(page.getByLabel("Welcome message · Deutsch"), "Willkommen bei den Nachteulen"))).toBe(200);
    await language.selectOption("en");
    await expect(page.getByLabel("Welcome message · English")).toHaveValue("");
    expect(await saves(page, () => typeInto(page.getByLabel("Welcome message · English"), "Welcome, night owls"))).toBe(200);

    await reloadWebPage(page, gateway);
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
  test("switching it on shows the ports to open, and the port range is locked while it is on", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openGatewayPage(page, gateway);
    const webrtc = page.getByRole("switch", { name: /Enable WebRTC/ });
    const start = page.getByLabel("Start port");
    await expect(webrtc).not.toBeChecked();
    await expect(page.getByText("Locked while WebRTC is on")).toBeHidden();
    await expect(page.getByText("Open these ports before guests connect")).toBeHidden();
    await expect(start).toBeEnabled();

    const range = page.getByRole("group", { name: "WebRTC UDP port range" });
    const lead = page.getByText("Use realtime audio when supported");
    const sizes = async () => [await range.boundingBox(), await lead.boundingBox()].map((box) => [box?.width, box?.height]);
    const before = await sizes();
    expect(await saves(page, () => webrtc.click())).toBe(200);
    await expect(page.getByText("Saved").first()).toBeVisible();
    expect(await sizes()).toEqual(before);
    const ports = page.getByText("Open these ports before guests connect");
    await expect(ports).toBeVisible();
    await expect(page.getByText("40000–40099 · UDP")).toBeVisible();
    await expect(webrtc).toBeChecked();
    await expect(start).toBeDisabled();
    await expect(page.getByRole("group", { name: "WebRTC UDP port range" })).toHaveAccessibleDescription(/Locked while WebRTC is on/);

    await reloadGatewayPage(page, gateway);
    await expect(page.getByRole("switch", { name: /Enable WebRTC/ })).toBeChecked();
    await expect(page.getByLabel("Start port")).toBeDisabled();
  });

  test("with it off the range can be changed and kept, and an impossible range is held back", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openGatewayPage(page, gateway);
    expect(await saves(page, () => typeInto(page.getByLabel("End port"), "41010"))).toBe(200);
    expect(await saves(page, () => typeInto(page.getByLabel("Start port"), "41000"))).toBe(200);
    await reloadGatewayPage(page, gateway);
    await expect(page.getByLabel("Start port")).toHaveValue("41000");
    await expect(page.getByLabel("End port")).toHaveValue("41010");

    // A start above the end is held back until the end follows.
    await typeInto(page.getByLabel("Start port"), "42000");
    await expect(page.getByText("Not saved: the end port must not be below the start port.")).toBeVisible();
    expect(await saves(page, () => typeInto(page.getByLabel("End port"), "42500"))).toBe(200);
    await expect(page.getByText("Not saved: the end port must not be below the start port.")).toHaveCount(0);
    await typeInto(page.getByLabel("Start port"), "43000");
    await expect(page.getByText("Not saved: the end port must not be below the start port.")).toBeVisible();
    await reloadGatewayPage(page, gateway);
    await expect(page.getByLabel("Start port")).toHaveValue("42000");
    await expect(page.getByLabel("End port")).toHaveValue("42500");
  });
});

test.describe("relay nodes", () => {
  test("a node is saved once it is complete, and enabling it waits for a token", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openGatewayPage(page, gateway);
    const incomplete = page.getByText("Not saved: enter a host and port, like relay.example.com:9987.");
    const tokenNeeded = page.getByText("Not saved: an enabled relay needs a token.");

    await page.getByRole("button", { name: "Add relay node" }).click();
    await typeInto(page.getByLabel("Relay display name"), "Frankfurt");
    await expect(incomplete).toBeVisible();
    expect(await saves(page, () => typeInto(page.getByLabel("Relay server address"), "relay.example.test:39087"))).toBe(200);
    await expect(incomplete).toHaveCount(0);
    await reloadGatewayPage(page, gateway);
    await expect(page.getByLabel("Relay display name")).toHaveValue("Frankfurt");
    await expect(page.getByLabel("Relay server address")).toHaveValue("relay.example.test:39087");

    const enabled = page.getByRole("checkbox", { name: "Frankfurt" });
    await enabled.check();
    await expect(tokenNeeded).toBeVisible();
    await page.getByRole("radio", { name: "Change" }).click();
    expect(await saves(page, () => typeInto(page.getByPlaceholder("Enter the relay service token"), "a-token-of-16-chars"))).toBe(200);
    await expect(tokenNeeded).toHaveCount(0);
    await reloadGatewayPage(page, gateway);
    await expect(page.getByRole("checkbox", { name: "Frankfurt" })).toBeChecked();
    await expect(page.getByPlaceholder("Token configured (leave blank to keep it)")).toBeVisible();
  });

  test("removing a node saves at once", async ({ page, ownGateway }) => {
    const gateway = await ownGateway();
    await openGatewayPage(page, gateway);
    await page.getByRole("button", { name: "Add relay node" }).click();
    await typeInto(page.getByLabel("Relay display name"), "Tokyo");
    expect(await saves(page, () => typeInto(page.getByLabel("Relay server address"), "tokyo.example.test"))).toBe(200);
    expect(await saves(page, () => page.getByRole("button", { name: "Remove", exact: true }).click())).toBe(200);
    await reloadGatewayPage(page, gateway);
    await expect(page.getByText("No relay nodes are configured.")).toBeVisible();
  });
});
