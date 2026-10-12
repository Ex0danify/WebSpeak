import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { useCannedApi } from "../fixtures/canned-api";

// A stored theme has to be on the page before the first paint, or a reload flashes the other theme (about 20 to 55 ms
// measured). Timing is flaky, so the test blocks every script and reads what the page looks like then, which holds because
// `index.html` has an inline theme script.

interface Look {
  theme: string | null;
  background: string;
}

const look = (page: Page): Promise<Look> =>
  page.evaluate(() => ({
    theme: document.documentElement.dataset.theme ?? null,
    background: getComputedStyle(document.body).backgroundColor,
  }));

async function storedDark(page: Page, blockScripts: boolean): Promise<Look> {
  await useCannedApi(page, { lang: "en", theme: "dark" });
  if (blockScripts) await page.route("**/*.js", (route) => route.abort());
  await page.goto("/", { waitUntil: blockScripts ? "load" : "networkidle" });
  return look(page);
}

test("a stored dark theme is applied before the app's script runs", async ({ page }) => {
  const loaded = await storedDark(page, false);
  expect(loaded.theme).toBe("dark");
  await page.unrouteAll();
  const early = await storedDark(page, true);
  expect(early).toEqual(loaded);
});
