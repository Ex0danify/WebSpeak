import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { launchOptions } from "./helpers/chromium";

const ci = process.env.CI === "true" || process.env.CI === "1";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  // Layer 5 (real TeamSpeak server) and layer 6 (visual, a11y) have their own config and command.
  testIgnore: ["legacy/**", "real/**", "visual/**", "a11y/**"],
  globalSetup: fileURLToPath(new URL("./global-setup.ts", import.meta.url)),
  outputDir: "../test-results/e2e",
  fullyParallel: true,
  workers: 4,
  retries: ci ? 1 : 0,
  reporter: ci ? [["list"], ["junit", { outputFile: "../test-results/junit-e2e.xml" }]] : [["list"]],
  use: {
    // The gateway fixture sets baseURL: every worker runs its own gateway.
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
