// File-size ratchet for the gateway. Twin of web/scripts/check-file-size.mjs.
//
//   npm run check:gateway-size               check
//   npm run check:gateway-size -- --update   rewrite the budget (only lowers or removes entries)
//
// Covers src/ and test/. A file over LIMIT lines needs an entry in gateway-size-budget.json with its current
// count, listed files may shrink but not grow. --update lowers entries and drops files under LIMIT, it never
// adds or raises one. Counts are newline counts like wc -l.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgetPath = join(root, "scripts", "gateway-size-budget.json");
const LIMIT = 400;
const update = process.argv.includes("--update");

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const listed = budget.files ?? {};

const counts = new Map();
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.ts$/.test(entry.name)) {
      const text = readFileSync(full, "utf8");
      counts.set(relative(root, full).split(sep).join("/"), text.split("\n").length - 1);
    }
  }
}
walk(join(root, "src"));
walk(join(root, "test"));

const errors = [];
const next = {};
for (const [file, lines] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
  const allowed = listed[file];
  if (allowed === undefined) {
    if (lines > LIMIT) errors.push(`${file}: ${lines} lines, over ${LIMIT} and not in the budget`);
    continue;
  }
  if (lines > allowed) errors.push(`${file}: ${lines} lines, budget ${allowed}`);
  if (lines > LIMIT) next[file] = Math.min(lines, allowed);
}
for (const file of Object.keys(listed)) {
  if (!counts.has(file)) errors.push(`${file}: in the budget but missing (rekey or remove it)`);
}

if (update && errors.length === 0) {
  writeFileSync(budgetPath, `${JSON.stringify({ limit: LIMIT, files: next }, null, 2)}\n`);
  console.log(`check:gateway-size: budget updated, ${Object.keys(next).length} file(s) over ${LIMIT}`);
  process.exit(0);
}

for (const line of errors) console.error(`FAIL: ${line}`);
const stale = Object.keys(listed).filter((f) => counts.has(f) && counts.get(f) < (listed[f] ?? 0));
if (stale.length && !errors.length) {
  console.log(`check:gateway-size: ${stale.length} file(s) shrank, run with --update to lower the budget`);
}
console.log(`check:gateway-size: ${errors.length} problem(s)`);
process.exit(errors.length ? 1 : 0);

const   formatProbe  =  {a:1,
      b:  [1,2,3]  };
void formatProbe
