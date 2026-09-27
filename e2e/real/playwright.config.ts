import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { launchOptions } from "../helpers/chromium";

const ci = process.env.CI === "true" || process.env.CI === "1";

// Layer 5: browsers against a real gateway and a disposable TeamSpeak server. One worker, one
// test at a time: the server flood-bans fast joins and one identity can join only once.
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: fileURLToPath(new URL("./global-setup.ts", import.meta.url)),
  globalTeardown: fileURLToPath(new URL("./global-teardown.ts", import.meta.url)),
  outputDir: "../../test-results/real/artifacts",
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci
    ? [["list"], ["junit", { outputFile: "../../test-results/junit-real.xml" }]]
    : [["list"]],
  use: {
    trace: "on-first-retry",
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
    launchOptions: launchOptions(),
  },
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } }],
});
