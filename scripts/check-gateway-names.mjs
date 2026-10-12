// Naming check for src/ and test/. Twin of web/scripts/check-names.mjs.
//
//   npm run check:gateway-names
//
// Rules: files and folders are camelCase, no utils, helpers, common or misc basenames, tests are
// name.aspect.test.ts with every part before .test.ts camelCase. The basename is the part before the first dot.
// SEVERITY error fails the run, warn only lists offenders.
import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SEVERITY = "error";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const BANNED = new Set(["utils", "helpers", "common", "misc"]);

const offenders = [];

function check(relPath, name, isDir) {
  const parts = isDir ? [name] : name.replace(/\.test\.[cm]?[jt]s$/, "").split(".");
  const isTest = !isDir && /\.test\.[cm]?[jt]s$/.test(name);
  // Plain files are checked by basename only (`a.b.ts` -> `a`); tests also check each aspect.
  const checked = isDir ? parts : isTest ? parts : [parts[0]];
  const problems = [];
  for (const part of checked) if (!CAMEL.test(part)) problems.push(`"${part}" is not camelCase`);
  if (BANNED.has(parts[0].toLowerCase())) problems.push(`banned name "${parts[0]}"`);
  if (problems.length) offenders.push(`${relPath}${isDir ? "/" : ""}: ${problems.join(", ")}`);
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(sep).join("/");
    if (entry.isDirectory()) {
      check(rel, entry.name, true);
      walk(full);
    } else {
      check(rel, entry.name, false);
    }
  }
}

walk(join(root, "src"));
walk(join(root, "test"));

const label = SEVERITY === "error" ? "FAIL" : "WARN";
for (const line of offenders) console.error(`${label}: ${line}`);
console.log(`check:gateway-names: ${offenders.length} offender(s) (${SEVERITY})`);
process.exit(offenders.length && SEVERITY === "error" ? 1 : 0);
