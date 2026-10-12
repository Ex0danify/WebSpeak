// Layer rules for the gateway, from CONTRIBUTING.md. Written against
// the tree (shared/, config/, infra/, modules/, transport/). SEVERITY "error" fails the run.
const SEVERITY = "error";

// Inside modules/ the order is relay < teamspeak < join < screenShare < voice < admin; a module may
// import only modules to its left.
const MODULE_ORDER = ["relay", "teamspeak", "join", "screenShare", "voice", "admin"];

const ROOTS = "^src/(index|relay)\\.ts$";

const moduleOrderRules = MODULE_ORDER.map((name, i) => ({
  name: `module-order-${name}`,
  severity: SEVERITY,
  comment: `modules/${name} imports only modules to its left (${MODULE_ORDER.slice(0, i).join(", ") || "none"}).`,
  from: { path: `^src/modules/${name}/` },
  to: { path: `^src/modules/(${[...MODULE_ORDER.slice(i + 1)].join("|") || "$^"})/` },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: SEVERITY,
      comment: "Import cycles are forbidden. A type-only import counts too.",
      from: {},
      to: { circular: true },
    },
    {
      name: "layers-shared",
      severity: SEVERITY,
      comment: "shared/ sits at the bottom: it imports nothing of the layers above.",
      from: { path: "^src/shared/" },
      to: { path: "^src/(config|infra|modules|transport)/|" + ROOTS },
    },
    {
      name: "layers-config",
      severity: SEVERITY,
      comment: "config/ imports shared/ only.",
      from: { path: "^src/config/" },
      to: { path: "^src/(infra|modules|transport)/|" + ROOTS },
    },
    {
      name: "layers-infra",
      severity: SEVERITY,
      comment: "infra/ imports config/ and shared/ only, never a module.",
      from: { path: "^src/infra/" },
      to: { path: "^src/(modules|transport)/|" + ROOTS },
    },
    {
      name: "layers-modules",
      severity: SEVERITY,
      comment: "modules/ import infra/, config/ and shared/, never transport or a composition root.",
      from: { path: "^src/modules/" },
      to: { path: "^src/transport/|" + ROOTS },
    },
    {
      name: "layers-transport",
      severity: SEVERITY,
      comment: "transport/ imports modules and below, never a composition root.",
      from: { path: "^src/transport/" },
      to: { path: ROOTS },
    },
    {
      name: "transport-only-from-roots",
      severity: SEVERITY,
      comment: "Only index.ts and relay.ts import transport/.",
      from: { pathNot: ["^src/transport/", ROOTS] },
      to: { path: "^src/transport/" },
    },
    ...moduleOrderRules,
    {
      name: "module-barrel-only",
      severity: SEVERITY,
      comment: "Another module's file is imported through its index.ts only.",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/[^/]+/",
        pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "module-barrel-only-outside",
      severity: SEVERITY,
      comment: "transport/, infra/ and the composition roots import a module through its index.ts only.",
      from: { pathNot: "^src/modules/" },
      to: {
        path: "^src/modules/[^/]+/",
        pathNot: "^src/modules/[^/]+/index\\.ts$",
      },
    },
    {
      name: "voice-subfolders-isolated",
      severity: SEVERITY,
      comment: "Files in voice/audio/ and voice/webrtc/ do not import each other.",
      from: { path: "^src/modules/voice/(audio|webrtc)/" },
      to: {
        path: "^src/modules/voice/(audio|webrtc)/",
        pathNot: "^src/modules/voice/$1/",
      },
    },
    {
      name: "voice-session-not-messages",
      severity: SEVERITY,
      comment: "voice/session/ does not import voice/messages/: messages sit on top of the session, not the other way round.",
      from: { path: "^src/modules/voice/session/" },
      to: { path: "^src/modules/voice/messages/" },
    },
    {
      name: "voice-directory-is-leaf",
      severity: SEVERITY,
      comment: "voice/directory/ imports no other voice subfolder (session, messages, audio, webrtc, bridge).",
      from: { path: "^src/modules/voice/directory/" },
      to: { path: "^src/modules/voice/(session|messages|audio|webrtc|bridge)/" },
    },
    {
      name: "voice-subfolders-not-bridge",
      severity: SEVERITY,
      comment: "No voice subfolder imports voiceBridge.ts; the bridge assembles them, not the reverse.",
      from: { path: "^src/modules/voice/(session|directory|messages|audio|webrtc)/" },
      to: { path: "^src/modules/voice/voiceBridge\\.ts$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Tests, test/ and e2e/ are exempt: they may import any file by path.
    exclude: { path: ["\\.test\\.ts$", "\\.d\\.ts$"] },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    moduleSystems: ["es6"],
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".ts", ".js", ".json"],
    },
  },
};
