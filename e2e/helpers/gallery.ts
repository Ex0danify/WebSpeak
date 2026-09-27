import { expect, type Page } from "@playwright/test";

/**
 * Opens the component gallery on the dev server of the worker (`galleryUrl` fixture) and waits for
 * its header. Every gallery test starts here with a stored language of English, since the gallery
 * has its own switcher and the join page's language is not what these tests are about.
 */
export async function openGallery(page: Page, galleryUrl: string): Promise<void> {
  await page.goto(`${galleryUrl}/__ui`);
  await expect(page.getByRole("heading", { level: 1, name: "UI gallery" })).toBeVisible();
}

/** One section of the gallery, found by the title of its heading (the h2 names its section). */
export function gallerySection(page: Page, title: string | RegExp) {
  return page.getByRole("region", { name: title });
}
