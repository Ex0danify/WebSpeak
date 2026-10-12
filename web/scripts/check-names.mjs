// Naming check for web/src. `.vue` files are PascalCase, every other file and folder is camelCase, and the basenames utils,
// helpers, common and misc are banned (except shared/i18n/common/). A file's basename is the part before its first dot. A test
// may also be PascalCase when it tests a component, and `vite-env.d.ts` is exempt.
import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const BANNED = new Set(["utils", "helpers", "common", "misc"]);
const BANNED_EXEMPT = "shared/i18n/common";
const FIXED_NAMES = new Set(["vite-env.d.ts"]);

const offenders = [];

function check(relPath, name, isDir) {
  if (FIXED_NAMES.has(name)) return;
  const base = isDir ? name : name.split(".")[0];
  const isVue = !isDir && name.endsWith(".vue");
  const isTest = !isDir && /\.test\.[cm]?[jt]s$/.test(name);
  const problems = [];
  if (isVue) {
    if (!PASCAL.test(base)) problems.push("expected PascalCase");
  } else if (!CAMEL.test(base) && !(isTest && PASCAL.test(base))) {
    problems.push("expected camelCase");
  }
  if (BANNED.has(base.toLowerCase()) && !`${relPath}/`.startsWith(`${BANNED_EXEMPT}/`)) {
    problems.push(`banned name "${base}"`);
  }
  if (problems.length) offenders.push(`${relPath}${isDir ? "/" : ""}: ${problems.join(", ")}`);
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    const rel = relative(srcDir, full).split(sep).join("/");
    if (entry.isDirectory()) {
      check(rel, entry.name, true);
      walk(full);
    } else {
      check(rel, entry.name, false);
    }
  }
}

walk(srcDir);

for (const line of offenders) console.error(`FAIL: ${line}`);
console.log(`check:names: ${offenders.length} offender(s)`);
process.exit(offenders.length ? 1 : 0);
