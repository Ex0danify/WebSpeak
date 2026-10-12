// Lint for the gateway (src, test, scripts), the web app (web/src) and the e2e specs.
// Type-aware rules read each area's own tsconfig. Layout belongs to Prettier, the project rules to the check:* scripts.
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import prettier from "eslint-config-prettier";

const root = fileURLToPath(new URL(".", import.meta.url));

const promiseRules = {
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/await-thenable": "error",
};

const area = (files, project, extra = {}) => ({
  files,
  languageOptions: { parserOptions: { project, tsconfigRootDir: root, extraFileExtensions: [".vue"] } },
  rules: { ...promiseRules, ...extra },
});

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "coverage/**", "test-results/**", "data/**", "web/public/**", ".snapshots/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  { files: ["src/**", "test/**", "scripts/**", "*.ts", "*.mjs"], languageOptions: { globals: globals.node } },
  { files: ["web/src/**"], languageOptions: { globals: globals.browser } },
  area(["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts", "vitest.config.ts"], "./tsconfig.json"),
  area(["web/src/**/*.ts", "web/src/**/*.vue"], "./web/tsconfig.json"),
  area(["e2e/**/*.ts"], "./e2e/tsconfig.json"),
  prettier,
  {
    rules: {
      // Props are typed with TypeScript, and the design-system components have one-word names (Button, Field, Menu).
      "vue/require-default-prop": "off",
      "vue/multi-word-component-names": "off",
    },
  },
  {
    // `interface MessageCatalog extends Record<...> {}` is the module augmentation shape, a type alias cannot merge.
    files: ["web/src/**/i18n/index.ts", "web/src/shared/i18n/*/index.ts"],
    rules: { "@typescript-eslint/no-empty-object-type": "off" },
  },
  {
    // Tests read JSON bodies and stub components in the quickest way; Playwright fixtures take an empty `{}` destructure.
    files: ["**/*.test.ts", "e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "vue/one-component-per-file": "off",
      "no-empty-pattern": "off",
    },
  },
  {
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
