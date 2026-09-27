import type { LaunchOptions } from "@playwright/test";

const ci = process.env.CI === "true" || process.env.CI === "1";

// System Chromium locally, Playwright's own Chromium in CI unless CHROMIUM_PATH says otherwise.
const executablePath = process.env.CHROMIUM_PATH ?? (ci ? undefined : "/usr/bin/chromium-browser");

/**
 * The launch options of every project. `test.use({ launchOptions })` replaces the whole object,
 * so a test that needs more flags builds its own from this one.
 */
export function launchOptions(extraArgs: string[] = []): LaunchOptions {
  return {
    executablePath,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      ...extraArgs,
    ],
  };
}
