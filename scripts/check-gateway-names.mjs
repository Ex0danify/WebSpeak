// Naming check for src/ and test/ (gateway-decompose plan G0.5). Twin of web/scripts/check-names.mjs.
//
//   npm run check:gateway-names
//
// Rules: every file and folder is camelCase; the basenames utils, helpers, common and misc are
// banned; a test is `name.aspect.test.ts` and every dot-separated part before `.test.ts` is
// camelCase. A file's basename is the part before its first dot. SEVERITY is "error" since step G1.12;
// "warn" lists offenders without failing the run.
import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SEVERITY = "error";

// Exempt by path (finding GF2, docs/design/gateway-decompose-findings.md): the plan keeps test/helpers/.
const EXEMPT = new Set(["test/helpers"]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const BANNED = new Set(["utils", "helpers", "common", "misc"]);

const offenders = [];

function check(relPath, name, isDir) {
  if (EXEMPT.has(relPath)) return;
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
