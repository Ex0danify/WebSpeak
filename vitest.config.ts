import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const ci = process.env.CI === "true" || process.env.CI === "1";

// Templates render public assets by absolute path ("/qq-group-qr.jpg"), which the vue plugin turns into
// an import. publicDir would resolve it, but that path crashes Vite on Windows, so map it to the real file.
function publicAssets(): Plugin {
  const dir = fileURLToPath(new URL("./web/public/", import.meta.url));
  return {
    name: "test-public-assets",
    resolveId(id) {
      if (id[0] !== "/" || !/\.(jpe?g|png|svg|webp|gif|ico)$/.test(id)) return;
      const file = join(dir, id.slice(1));
      return existsSync(file) ? file : undefined;
    },
  };
}

export default defineConfig({
  test: {
    // Two tests are load-sensitive (useJoinIdentity "remember-identity", gateway admin setup): CI retries them, and the reporter marks a test that passed on retry as flaky.
    retry: ci ? 2 : 0,
    // In CI a JUnit report lands in test-results/ (gitignored) next to the console output.
    reporters: ci ? ["default", "junit"] : ["default"],
    outputFile: { junit: "test-results/junit-vitest.xml" },
    projects: [
      {
        test: {
          name: "gateway",
          environment: "node",
          include: ["src/**/*.test.ts", "test/**/*.test.ts"],
        },
      },
      {
        // Reuse the web app's plugins and the "@" alias.
        extends: "./web/vite.config.ts",
        plugins: [publicAssets()],
        test: {
          name: "web",
          environment: "happy-dom",
          include: ["web/src/**/*.test.ts"],
          setupFiles: ["web/src/testSetup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "web/src/**/*.{ts,vue}"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      reporter: ci ? ["text-summary", "json-summary", "lcov", "html"] : ["text-summary", "html"],
      reportsDirectory: "test-results/coverage",
      // Only the own TeamSpeak client has a gate (PLAN.md D7), the rest of the project is a review target.
      thresholds: { "src/lib/**": { lines: 90, branches: 80 } },
    },
  },
});
