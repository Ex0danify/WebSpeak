// Lists (default: fails on) plan, step and finding references in source, test and script files.
// Comments state a rule, never when or by which plan it arose.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(import.meta.url), "../..");
const args = process.argv.slice(2);
const report = args.includes("--report");
const soft = args.includes("--soft");
const webOnly = args.includes("--web");
const rootDirs = ["src", "test", "e2e", "scripts"];
const webDirs = ["web/src", "web/scripts"];
const dirs = args.includes("--all") ? [...rootDirs, ...webDirs] : webOnly ? webDirs : rootDirs;
const extraFiles = [
  ".dependency-cruiser.cjs",
  "web/.dependency-cruiser.cjs",
  "package.json",
  "web/package.json",
  ".github/workflows/ci.yml",
  ".github/workflows/build-release.yml",
];
const exts = new Set([".ts", ".vue", ".mjs", ".cjs", ".js", ".css", ".json", ".yml"]);
const skipDirs = new Set(["node_modules", "dist", ".git", "coverage", "test-results"]);
const self = "scripts/check-comment-refs.mjs";

const patterns = [
  ["finding id", /\b(?:(?:GF|RF|VD|SF|HF|RV|IF|DF)[0-9]+|F(?!8\b|10\b)[0-9]+)\b/],
  ["step id", /\b[GHIRW][0-9]\.[0-9]+\b|\bStep [A-Z]?[0-9]|\bTrack [A-Z]?[0-9]/],
  ["plan file", /[a-z0-9-]+-(?:plan|findings)\.md|\bfindings\.md\b|\bcolor-map\.md\b|docs\/(?:design|testing)\/|project-structure/],
  ["gate/decision id", /\b(?:G|W)-[A-Z]{2,}(?:-[A-Z]+)*\b|\bD-[A-Z]*[0-9]+\b|\b[VIRHSG]-D[0-9]+\b/],
  ["phase", /\bphase [12]\b/i],
  ["history", /moved verbatim|carried over from|\bverbatim first\b/i],
];
// Report-only: wording that often narrates history. Too ambiguous to gate on, so a person reads these.
const softPatterns = [["history?", /\bused to (?!be\b|rate|invalidate|match|open)|\bformerly\b|\bnow lives\b|\bwas moved\b/i]];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (exts.has(name.slice(name.lastIndexOf(".")))) yield full;
  }
}

const hits = [];
for (const d of dirs) {
  let root;
  try {
    root = join(repo, d);
    statSync(root);
  } catch {
    continue;
  }
  for (const file of walk(root)) {
    const rel = relative(repo, file);
    if (rel === self || rel.endsWith("package-lock.json")) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const [kind, re] of soft ? [...patterns, ...softPatterns] : patterns)
          if (re.test(line)) hits.push({ rel, n: i + 1, kind, line: line.trim() });
      });
  }
}

const scanFile = (file) => {
  const rel = relative(repo, file);
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const [kind, re] of soft ? [...patterns, ...softPatterns] : patterns)
        if (re.test(line)) hits.push({ rel, n: i + 1, kind, line: line.trim() });
    });
};
const wantAll = args.includes("--all");
for (const f of extraFiles) {
  if (!wantAll && f.startsWith("web/") !== webOnly) continue;
  try {
    scanFile(join(repo, f));
  } catch {
    // an optional file that this checkout does not have
  }
}

if (report) {
  for (const h of hits) console.log(`${h.rel}:${h.n} [${h.kind}] ${h.line.slice(0, 160)}`);
  console.log(`${hits.length} lines in ${new Set(hits.map((h) => h.rel)).size} files`);
  process.exit(0);
}
if (hits.length) {
  for (const h of hits) console.error(`${h.rel}:${h.n} [${h.kind}] ${h.line.slice(0, 120)}`);
  console.error(`check:comment-refs: ${hits.length} plan/step/finding reference(s). Comments say why, not when.`);
  process.exit(1);
}
console.log("check:comment-refs: 0 references");
