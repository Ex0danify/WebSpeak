import { expect, test } from "./fixtures";
import { gallerySection, openGallery } from "./helpers";

// The component gallery (`/__ui`) on a Vite dev server of the worker, because only the dev build has
// it. This file checks that it renders; the keyboard contracts of the components are in
// `gallery.*.spec.ts`.

const sections = [
  "Button",
  "Field · Input · Select · Textarea",
  "Switch",
  "Checkbox · Radio",
  "Slider",
  "Chip and Count",
  "Tabs and Segmented",
  "Card",
  "Avatar",
  "Meter",
  "Dialog",
  "Menu",
  "Popover",
  "Tooltip",
  "Toast and Banner",
  "Separator · Kbd · Spinner · Skeleton",
  "Icon",
];

test("the gallery shows a section for each ui component without errors", async ({ page, galleryUrl }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    // The avatar section loads /missing.png on purpose, to show the fallback.
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) problems.push(message.text());
  });

  await openGallery(page, galleryUrl);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(sections);
  for (const title of sections) await expect(gallerySection(page, title)).toBeAttached();
  expect(problems).toEqual([]);
});
