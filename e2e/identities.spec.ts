import { expect, test } from "./fixtures";
import { join, submitJoin } from "./helpers";
import { identities, storageStateFor } from "./real/identities";

// The seeded identities of layer 5 (`e2e/real/identities.ts`), checked here against the fake
// server because the browser side needs no TeamSpeak: what the client sends in its join request.
test.describe("seeded identity", () => {
  test.skip(({ isMobile }) => isMobile, "the storage state does not depend on the viewport");

  test("a browser seeded with identity 0 restores it and sends it with the join", async ({ browser, gateway }) => {
    const context = await browser.newContext({ baseURL: gateway.url, storageState: storageStateFor(0, gateway.url) as never });
    const page = await context.newPage();
    const ticket = page.waitForRequest((r) => r.url().endsWith("/api/join-ticket"));
    await join(page, "Seeded Zero");
    const body = (await ticket).postDataJSON();
    expect(body.identity).toBe(identities.get(0).privateMaterial);
    expect(body.rememberIdentity).toBe(true);
    await context.close();
  });

  test("another index is another identity", async ({ browser, gateway }) => {
    const context = await browser.newContext({ baseURL: gateway.url, storageState: storageStateFor(1, gateway.url) as never });
    const page = await context.newPage();
    const ticket = page.waitForRequest((r) => r.url().endsWith("/api/join-ticket"));
    await join(page, "Seeded One");
    expect((await ticket).postDataJSON().identity).toBe(identities.get(1).privateMaterial);
    expect(identities.get(1).privateMaterial).not.toBe(identities.get(0).privateMaterial);
    await context.close();
  });

  test("an unseeded first-time browser has no identity to send yet; the gateway hands one out", async ({ page }) => {
    const ticket = page.waitForRequest((r) => r.url().endsWith("/api/join-ticket"));
    await submitJoin(page, "Unseeded");
    const body = (await ticket).postDataJSON();
    expect(body.identity ?? "").toBe("");
  });
});
