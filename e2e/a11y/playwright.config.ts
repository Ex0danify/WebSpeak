import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { launchOptions } from "../helpers/chromium";

const ci = process.env.CI === "true" || process.env.CI === "1";

// Layer 6, accessibility: axe scans, keyboard traversal, touch targets and focus rings on the
// guest page, the connected room (scripted gateway) and the admin console (canned API).
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: fileURLToPath(new URL("../global-setup.ts", import.meta.url)),
  outputDir: "../../test-results/a11y",
  fullyParallel: true,
  workers: 4,
  retries: ci ? 1 : 0,
  reporter: ci
    ? [["list"], ["junit", { outputFile: "../../test-results/junit-a11y.xml" }]]
    : [["list"]],
  use: {
    trace: "on-first-retry",
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
    launchOptions: launchOptions(),
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
