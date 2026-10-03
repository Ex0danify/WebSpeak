// File-size ratchet for web/src (structure plan S7.2).
//
//   npm run check:file-size            check
//   npm run check:file-size -- --update   rewrite the budget (only lowers or removes entries)
//
// A file over LIMIT lines must be listed in file-size-budget.json with its current line count.
// A listed file may shrink but not grow; an unlisted file may not cross LIMIT. `--update`
// lowers entries to the current count and drops files that fell under LIMIT; it never adds
// or raises one. Counts are newline counts (as `wc -l`). Part of `npm run build`.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgetPath = join(root, "scripts", "file-size-budget.json");
const LIMIT = 400;
const update = process.argv.includes("--update");

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const listed = budget.files ?? {};

const counts = new Map();
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(vue|ts)$/.test(entry.name)) {
      const text = readFileSync(full, "utf8");
      counts.set(relative(root, full).split(sep).join("/"), text.split("\n").length - 1);
    }
  }
}
walk(join(root, "src"));

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
  console.log(`check:file-size: budget updated, ${Object.keys(next).length} file(s) over ${LIMIT}`);
  process.exit(0);
}

for (const line of errors) console.error(`FAIL: ${line}`);
const stale = Object.keys(listed).filter((f) => counts.has(f) && counts.get(f) < (listed[f] ?? 0));
if (stale.length && !errors.length) {
  console.log(`check:file-size: ${stale.length} file(s) shrank, run with --update to lower the budget`);
}
console.log(`check:file-size: ${errors.length} problem(s)`);
process.exit(errors.length ? 1 : 0);
