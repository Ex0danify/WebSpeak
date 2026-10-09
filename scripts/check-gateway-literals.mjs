// CJK-line budget for the gateway side (a ratchet, i18n plan I0.5). For every text file under
// src/, test/, e2e/ and scripts/ it counts lines holding a CJK character,
// comments included, and fails when a count exceeds the file's budget in
// scripts/gateway-literals-budget.json. Files without an entry have a budget of 0.
//
//   npm run check:gateway-literals                   check
//   npm run check:gateway-literals -- --update       lower budgets to the current counts
//                                                    (never raises one, never adds a file)
//   npm run check:gateway-literals -- --init         also add entries for files over budget 0
//                                                    (seeding only; review the diff)
//
// `ignore` entries ({ "file": "...", "reason": "..." }) exempt a whole file; each needs a reason.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgetPath = join(root, "scripts", "gateway-literals-budget.json");
const init = process.argv.includes("--init");
const update = process.argv.includes("--update") || init;

const SCOPE = ["src", "test", "e2e", "scripts"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const TEXT_FILE = /\.(ts|mts|cts|js|mjs|cjs|json|md|html|css|yml|yaml|sh|txt)$/;

// CJK ideographs, kana, CJK punctuation, fullwidth forms, Hangul.
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/u;

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...sourceFiles(path));
    } else if (TEXT_FILE.test(entry.name) && entry.name !== "gateway-literals-budget.json") {
      files.push(path);
    }
  }
  return files;
}

const countCjk = (path) => readFileSync(path, "utf8").split("\n").filter((line) => CJK.test(line)).length;

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const ignored = new Set((budget.ignore ?? []).map((entry) => entry.file));
const files = SCOPE.flatMap((dir) => sourceFiles(join(root, dir)))
  .map((path) => relative(root, path).split("\\").join("/"))
  .sort();
const problems = [];
const lowered = [];
const added = [];

for (const entry of budget.ignore ?? []) {
  if (!entry.reason || !entry.reason.trim()) problems.push(`${entry.file}: ignore entry has no reason`);
  if (!existsSync(join(root, entry.file))) problems.push(`${entry.file}: ignored but no longer exists (remove the entry)`);
}
for (const file of Object.keys(budget.files)) {
  if (!files.includes(file)) problems.push(`${file}: listed in the budget but no longer exists or is out of scope (remove the entry)`);
}

for (const file of files) {
  if (ignored.has(file)) continue;
  const current = countCjk(join(root, file));
  const limit = budget.files[file] ?? 0;
  const seeding = init && !(file in budget.files);
  if (current > limit && !seeding) problems.push(`${file}: ${current} CJK line(s) exceed budget ${limit}`);
  else if (current < limit) lowered.push({ file, from: limit, to: current });
  if (update && !problems.length) {
    if (file in budget.files) {
      const next = Math.min(limit, current);
      if (next) budget.files[file] = next;
      else delete budget.files[file];
    } else if (init && current) {
      budget.files[file] = current;
      added.push(file);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("FAIL: gateway literal budget check");
  process.exit(1);
}

if (update) {
  const sorted = Object.fromEntries(Object.entries(budget.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(budgetPath, `${JSON.stringify({ ...budget, files: sorted }, null, 2)}\n`);
  console.log(`budget updated (${lowered.length} value(s) lowered, ${added.length} file(s) added)`);
} else {
  for (const change of lowered) console.log(`below budget: ${change.file} ${change.to} < ${change.from} (run check:gateway-literals -- --update)`);
  const total = Object.values(budget.files).reduce((sum, n) => sum + n, 0);
  console.log(`OK: gateway literal budget (${Object.keys(budget.files).length} file(s), ${total} CJK line(s) allowed)`);
}
