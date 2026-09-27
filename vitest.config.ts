import { defineConfig } from "vitest/config";

const ci = process.env.CI === "true" || process.env.CI === "1";

export default defineConfig({
  test: {
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
        // Templates import public assets by absolute path ("/qq-group-qr.jpg").
        publicDir: "web/public",
        test: {
          name: "web",
          environment: "happy-dom",
          include: ["web/src/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "web/src/**/*.{ts,vue}"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      reporter: ci ? ["text-summary", "json-summary", "html"] : ["text-summary", "html"],
      reportsDirectory: "test-results/coverage",
    },
  },
});
