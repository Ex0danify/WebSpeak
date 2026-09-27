import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openMemberMenu } from "../helpers";
import { menuAction } from "./ui";

// Poking through the real server (step 5.5). Poking asks for its message with the browser's prompt.

async function poke(page: Page, nickname: string, answer: string | null): Promise<void> {
  page.once("dialog", (dialog) => (answer === null ? dialog.dismiss() : dialog.accept(answer)));
  await menuAction(await openMemberMenu(page, nickname), "Poke").click();
  await expect(page.getByText("Poke sent", { exact: true })).toBeVisible();
}

test("a poke arrives as a banner with the sender's name and message, and Close removes it", async ({ person, testChannel }) => {
  const room = await testChannel("real-poke");
  const alice = await person(0, "poke-alice");
  const bob = await person(1, "poke-bob");
  await alice.join(room.name);
  await bob.join(room.name);

  await poke(alice.page, bob.nickname, "wake up");
  const banner = bob.page.getByRole("status").filter({ hasText: "poked you" });
  await expect(banner).toHaveCount(1);
  await expect(banner).toContainText(`${alice.nickname} poked you`);
  await expect(banner).toContainText("wake up");
  await banner.getByRole("button", { name: "Close" }).click();
  await expect(banner).toHaveCount(0);
  await expect(alice.page.getByRole("status").filter({ hasText: "poked you" })).toHaveCount(0);
});

test("a poke works across channels, and one without a message is only the title", async ({ person, testChannel }) => {
  const here = await testChannel("real-poke-here");
  const there = await testChannel("real-poke-there");
  const alice = await person(0, "poke-far-alice");
  const bob = await person(1, "poke-far-bob");
  await alice.join(here.name);
  await bob.join(there.name);

  await poke(alice.page, bob.nickname, null);
  await expect(bob.page.getByRole("status").filter({ hasText: "poked you" })).toHaveText(new RegExp(`^\\s*${alice.nickname} poked you\\s*$`));
});
