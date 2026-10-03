import { ServerError } from "@echosixhiya/teamspeak-client";
import { expect, test } from "./fixtures";
import { expectInRoom, memberRow, submitJoin } from "./helpers";
import { storageStateFor } from "./real/identities";

// The join form against the real gateway and the fake TeamSpeak server behind it. The workers'
// gateways are reused by every test of a worker, so nicknames are unique and a test that changes
// the fake server puts it back.

const joinButton = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Enter voice space" });

test.describe("join form", () => {
  test("the join button waits for a nickname", async ({ page }) => {
    await page.goto("/");
    const nickname = page.getByLabel("Your nickname");
    await expect(nickname).toBeFocused();
    await expect(joinButton(page)).toBeDisabled();
    await nickname.fill("join-valid");
    await expect(joinButton(page)).toBeEnabled();
    await nickname.fill("");
    await expect(joinButton(page)).toBeDisabled();
  });

  test("a nickname of only spaces does not enable the button", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Your nickname").fill("   ");
    await expect(joinButton(page)).toBeDisabled();
  });

  test("the nickname is limited to 30 characters", async ({ page }) => {
    await page.goto("/");
    const nickname = page.getByLabel("Your nickname");
    await nickname.fill("n".repeat(45));
    await expect(nickname).toHaveValue("n".repeat(30));
  });

  test("the nickname is remembered for the next visit", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Your nickname")).toHaveValue("");
    await page.getByLabel("Your nickname").fill("join-remembered");
    await joinButton(page).click();
    await expectInRoom(page, "join-remembered");
    await page.reload();
    await expect(page.getByLabel("Your nickname")).toHaveValue("join-remembered");
  });

  test("the room is at /room, and a reload there lands on the join page", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Your nickname").fill("join-route");
    await joinButton(page).click();
    await expectInRoom(page, "join-route");
    expect(new URL(page.url()).pathname).toBe("/room");
    await page.reload();
    await expect(page.getByLabel("Your nickname")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("a nickname with spaces around it is trimmed", async ({ page, gateway }) => {
    await submitJoin(page, "  join-trimmed  ");
    await expectInRoom(page, "join-trimmed");
    expect([...gateway.ts.members.values()].map((member) => member.nickname)).toContain("join-trimmed");
  });

  test("Enter in the nickname field joins", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Your nickname").fill("join-enter");
    await page.keyboard.press("Enter");
    await expectInRoom(page, "join-enter");
  });

  test("a target channel named in the form is where the member lands", async ({ page, gateway }) => {
    await page.goto("/");
    await page.getByLabel("Your nickname").fill("join-target");
    await page.getByLabel(/Target channel/).fill("Room B");
    await joinButton(page).click();
    await expectInRoom(page, "join-target");
    const self = [...gateway.ts.members.values()].find((member) => member.nickname === "join-target")!;
    expect(gateway.ts.channels.get(self.channelID)?.name).toBe("Room B");
  });

  test("the channel of the link fills the form", async ({ page }) => {
    await page.goto("/?channel=Room%20A");
    await expect(page.getByLabel(/Target channel/)).toHaveValue("Room A");
  });

  test("without a target channel the member lands in the server default", async ({ page, gateway }) => {
    await submitJoin(page, "join-default");
    await expectInRoom(page, "join-default");
    const self = [...gateway.ts.members.values()].find((member) => member.nickname === "join-default")!;
    expect(self.channelID).toBe(gateway.ts.defaultChannelId);
  });

  test("a refused join shows the reason and its code, and the form stays usable", async ({ page, gateway }) => {
    gateway.ts.failNext("connect", new ServerError("513", "nickname is already in use"));
    await submitJoin(page, "join-refused");
    await expect(page.getByText("NICKNAME_IN_USE")).toBeVisible();
    await expect(page.getByLabel("Your nickname")).toHaveValue("join-refused");
    await expect(joinButton(page)).toBeEnabled();
    // the same form joins once the refusal is gone
    await joinButton(page).click();
    await expectInRoom(page, "join-refused");
    await expect(memberRow(page, "join-refused")).toBeVisible();
  });

  // F2: the smoke run saw the form stay put with no visible reason. The reason is on screen for both
  // failures it was suspected of; what the smoke run measured was the lease race of F37.
  test("a ban is shown with its reason and code, and the form stays usable (F2)", async ({ page, gateway }) => {
    gateway.ts.failNext("connect", new ServerError("3329", "you are banned"));
    await submitJoin(page, "join-banned");
    await expect(page.getByText("You are banned from this server, so the connection is refused")).toBeVisible();
    await expect(page.getByText("Error code: BANNED")).toBeVisible();
    await expect(joinButton(page)).toBeEnabled();
  });

  test("an identity that another page is using is refused with its reason and code (F2)", async ({ browser, gateway }) => {
    const options = { baseURL: gateway.url, storageState: storageStateFor(2, gateway.url) as never };
    const first = await browser.newContext(options);
    const second = await browser.newContext(options);
    try {
      const owner = await first.newPage();
      await submitJoin(owner, "identity-owner");
      await expectInRoom(owner, "identity-owner");
      const other = await second.newPage();
      await submitJoin(other, "identity-other");
      await expect(other.getByText("This TeamSpeak identity is already used by another browser page")).toBeVisible();
      await expect(other.getByText("Error code: IDENTITY_IN_USE")).toBeVisible();
      await expect(joinButton(other)).toBeEnabled();
    } finally {
      await first.close();
      await second.close();
    }
  });
});
