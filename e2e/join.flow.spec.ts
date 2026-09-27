import { expect, test } from "./fixtures";
import { expectInRoom, join } from "./helpers";
import type { Gateway } from "../test/helpers/gateway";

// Invite links, and what the join form does when the gateway ends the session. Real gateway, fake
// TeamSpeak server. The gateway of a worker is shared by its tests, so every invite is its own.

test.describe("invite link", () => {
  test("joins with the channel the invite names, without asking for anything else", async ({ page, gateway }) => {
    const { token } = gateway.adminService.createManagedInvite({ channel: "Room B", expiresInHours: 1, maxUses: 1 });
    await page.goto(`/?invite=${token}`);
    await page.getByLabel("Your nickname").fill("invite-channel");
    await page.getByRole("button", { name: "Enter voice space" }).click();
    await expectInRoom(page, "invite-channel");
    const self = [...gateway.ts.members.values()].find((member) => member.nickname === "invite-channel")!;
    expect(gateway.ts.channels.get(self.channelID)?.name).toBe("Room B");
  });

  test("a single-use invite is spent by the first join and the next visitor is told it is invalid", async ({ page, openSession, gateway }) => {
    const { token } = gateway.adminService.createManagedInvite({ channel: "", expiresInHours: 1, maxUses: 1 });
    const link = `/?invite=${token}`;
    await page.goto(link);
    await page.getByLabel("Your nickname").fill("invite-first");
    await page.getByRole("button", { name: "Enter voice space" }).click();
    await expectInRoom(page, "invite-first");

    const other = (await openSession()).page;
    await other.goto(link);
    await other.getByLabel("Your nickname").fill("invite-second");
    await other.getByRole("button", { name: "Enter voice space" }).click();
    await expect(other.getByText("The invite link is invalid, expired, or revoked")).toBeVisible();
    await expect(other.getByLabel("Your nickname")).toBeVisible();
  });

  test("a revoked invite is refused", async ({ page, gateway }) => {
    const { invite, token } = gateway.adminService.createManagedInvite({ channel: "", expiresInHours: 1, maxUses: 0 });
    gateway.adminService.revokeManagedInvite(invite.id);
    await page.goto(`/?invite=${token}`);
    await page.getByLabel("Your nickname").fill("invite-revoked");
    await page.getByRole("button", { name: "Enter voice space" }).click();
    await expect(page.getByText("The invite link is invalid, expired, or revoked")).toBeVisible();
  });
});

test.describe("a lost connection", () => {
  // Ends the gateway session of `nickname` the way the admin console's "terminate" button does.
  async function terminateFromAdmin(gateway: Gateway, nickname: string) {
    const self = [...gateway.ts.members.values()].find((member) => member.nickname === nickname)!;
    const admin = await gateway.adminLogin();
    const { sessions } = (await (await admin.get("sessions")).json()) as { sessions: { id: string; tsClientId: number }[] };
    const mine = sessions.find((session) => session.tsClientId === self.id)!;
    expect((await admin.post(`sessions/${mine.id}/terminate`)).status).toBe(200);
  }

  test("F21: an administrator ending the session returns the client to the join form without a word", async ({ page, gateway }) => {
    await join(page, "lost-terminated");
    await terminateFromAdmin(gateway, "lost-terminated");
    await expect(page.getByRole("button", { name: "Enter voice space" })).toBeVisible();
    await expect(page.getByLabel("Your nickname")).toHaveValue("lost-terminated");
    // The gateway closes with code 1000, which the client reads as a normal leave: no notice.
    await expect(page.getByText(/Error code:/)).toBeHidden();
  });

  test("F21: an administrator ending the session tells the person why (bug F21)", async ({ page, gateway }) => {
    test.fail();
    await join(page, "lost-told");
    await terminateFromAdmin(gateway, "lost-told");
    await expect(page.getByRole("button", { name: "Enter voice space" })).toBeVisible();
    // Any notice will do, the wording is the fix's to decide; a notice with a code is what every other refusal shows.
    await expect(page.getByText(/Error code:/)).toBeVisible({ timeout: 2000 });
  });

  test("a kick from TeamSpeak returns the client to the join form with the reason code, and it can join again", async ({ page, gateway }) => {
    await join(page, "lost-kicked");
    const client = gateway.ts.created.find((created) => created.options.nickname === "lost-kicked")!;
    gateway.ts.kick(client, "behave");
    await expect(page.getByRole("button", { name: "Enter voice space" })).toBeVisible();
    await expect(page.getByText("You were removed from the server")).toBeVisible();
    await expect(page.getByText("Error code: KICKED")).toBeVisible();
    await page.getByRole("button", { name: "Enter voice space" }).click();
    await expectInRoom(page, "lost-kicked");
    await expect(page.getByText("Error code: KICKED")).toBeHidden();
  });
});
