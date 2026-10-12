// Layer rules from CONTRIBUTING.md, written against the
// paths (features/, shared/, views/). Every rule is an error.
const SEVERITY = "error";

// Code that composes the whole app and may reach into any feature: the entry point, the Vitest
// setup file and the shared test helpers (testSupport/ builds the full room session).
const COMPOSITION_ROOTS = "^src/(main\\.ts|testSetup\\.ts|testSupport/)";

const SCREEN_OR_ENGINE = "voice|screenShare|join|admin|demo";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: SEVERITY,
      comment:
        "Import cycles are forbidden. The admin stores reach each other through adminSiblings.ts.",
      from: {},
      to: { circular: true },
    },
    {
      name: "shared-imports-no-features",
      severity: SEVERITY,
      comment: "shared/ sits at the bottom: it imports nothing from features, views or app.",
      from: { path: "^src/shared/" },
      to: { path: "^src/(features|views|app)/" },
    },
    {
      name: "session-is-base",
      severity: SEVERITY,
      comment: "session/ imports only shared/.",
      from: { path: "^src/features/session/" },
      to: { path: "^src/(features/(room|voice|screenShare|join|admin|demo)|views|app)/" },
    },
    {
      name: "features-not-up",
      severity: SEVERITY,
      comment: "Features never import views or app; only room/ may import other features' peers.",
      from: { path: "^src/features/" },
      to: { path: "^src/(views|app)/" },
    },
    {
      name: "same-layer-no-imports",
      severity: SEVERITY,
      comment: "voice, screenShare, join, admin and demo are one layer and never import each other.",
      from: { path: `^src/features/(${SCREEN_OR_ENGINE})/` },
      to: {
        path: `^src/features/(${SCREEN_OR_ENGINE})/`,
        pathNot: "^src/features/$1/",
      },
    },
    {
      name: "below-room-no-room",
      severity: SEVERITY,
      comment: "Nothing below features/room imports room.",
      from: { path: `^src/features/(${SCREEN_OR_ENGINE}|session)/` },
      to: { path: "^src/features/room/" },
    },
    {
      name: "room-siblings-isolated",
      severity: SEVERITY,
      comment:
        "Sub-features of room/ do not import each other. Only room/shell and the room root compose them.",
      from: {
        path: "^src/features/room/([^/]+)/",
        pathNot: "^src/features/room/shell/",
      },
      to: {
        path: "^src/features/room/[^/]+/",
        pathNot: ["^src/features/room/$1/", "^src/features/room/shell/"],
      },
    },
    {
      name: "feature-barrel-only",
      severity: SEVERITY,
      comment: "Other folders import a feature through its index.ts only.",
      from: { path: "^src/features/([^/]+)/" },
      to: {
        path: "^src/features/[^/]+/",
        pathNot: ["^src/features/$1/", "^src/features/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "feature-barrel-only-outside",
      severity: SEVERITY,
      comment:
        "App, views and shared import a feature through its index.ts only. A module's i18n/index.ts is " +
        "its message registration entry point, imported by main.ts and testSetup.ts (the room barrel pulls in a wasm file).",
      from: { pathNot: ["^src/features/", COMPOSITION_ROOTS] },
      to: {
        path: "^src/features/[^/]+/",
        pathNot: ["^src/features/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "ui-barrel-only",
      severity: SEVERITY,
      comment: "shared/ui components are imported through their folder's index.ts.",
      from: { pathNot: "^src/shared/ui/" },
      to: {
        path: "^src/shared/ui/[^/]+/",
        // ui/shared/ holds helpers used by several ui folders and has no barrel by design.
        pathNot: ["^src/shared/ui/[^/]+/index\\.ts$", "^src/shared/ui/shared/"],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    moduleSystems: ["es6"],
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".ts", ".vue", ".js", ".json"],
    },
    exclude: { path: "\\.d\\.ts$" },
  },
};
