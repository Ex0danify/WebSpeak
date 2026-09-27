import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { withAudioTone } from "../helpers/tone";

const ci = process.env.CI === "true" || process.env.CI === "1";

// Layer 6, screenshots: the guest page, the demo, the admin console and the connected room on the
// scripted gateway, in light and dark, on a desktop and a phone viewport. Baselines are not
// committed (D-T4): capture them once on the commit to compare against with
// `npm run test:visual -- --update-snapshots`, then run `npm run test:visual` after the change.
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: fileURLToPath(new URL("../global-setup.ts", import.meta.url)),
  outputDir: "../../test-results/visual",
  snapshotDir: "../../.snapshots/baseline",
  snapshotPathTemplate: "{snapshotDir}/{arg}{ext}",
  fullyParallel: true,
  workers: 4,
  // A screenshot that differs is a difference, not a flake: no retries.
  retries: 0,
  reporter: ci
    ? [["list"], ["junit", { outputFile: "../../test-results/junit-visual.xml" }]]
    : [["list"]],
  expect: {
    toHaveScreenshot: {
      // Per pixel colour distance, then the share of pixels allowed to differ (0.01 %).
      threshold: 0.1,
      maxDiffPixelRatio: 0.0001,
      animations: "allow",
      stylePath: fileURLToPath(new URL("./freeze.css", import.meta.url)),
    },
  },
  use: {
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    permissions: ["microphone"],
    // A silent microphone keeps the input meter flat; the font flags keep text rendering the same.
    ...withAudioTone({ amplitude: 0, extraArgs: ["--font-render-hinting=none", "--disable-lcd-text"] }),
  },
  // The phone is a viewport only, as the old snapshot tool had it: no touch emulation, so the
  // shots show the layout and not the coarse-pointer variants of the controls.
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
