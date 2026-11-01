import { expect, test } from "./fixtures";

test("the gateway serves the fresh web build and the join form renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Nickname")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter voice space" })).toBeDisabled();
});

test("a join reaches the fake TeamSpeak server behind the gateway", async ({ page, gateway }) => {
  await page.goto("/");
  await page.getByLabel("Nickname").fill("e2e-smoke");
  await page.getByRole("button", { name: "Enter voice space" }).click();
  await expect.poll(() => [...gateway.ts.members.values()].map((member) => member.nickname)).toContain("e2e-smoke");
  // The audio dock on a phone sits in a section that is not shown on the first tab, so skip hidden copies of the name.
  await expect(page.getByText("e2e-smoke").filter({ visible: true }).first()).toBeVisible();
});
