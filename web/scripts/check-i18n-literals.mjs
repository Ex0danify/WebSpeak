// User-visible-literal budget (a ratchet, i18n plan I0.3). For every non-test file under src/
// outside `i18n/` folders (and web/index.html) it counts
//   cjk       lines holding a CJK character, comments included
//   literals  in .vue templates: text nodes and static title|aria-label|placeholder|alt|label
//             attributes that hold a letter (bound `:title="..."` and `{{ }}` are not literals)
// and fails when a count exceeds the file's budget in scripts/i18n-literals-budget.json.
// Files without an entry have a budget of 0.
//
//   npm run check:i18n-literals                   check
//   npm run check:i18n-literals -- --update       lower budgets to the current counts
//                                                 (never raises one, never adds a file)
//   npm run check:i18n-literals -- --init         also add entries for files over budget 0
//                                                 (seeding only; review the diff)
//
// `ignore` entries ({ "file": "...", "reason": "..." }) exempt a whole file; each needs a reason.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgetPath = join(root, "scripts", "i18n-literals-budget.json");
const update = process.argv.includes("--update") || process.argv.includes("--init");
const init = process.argv.includes("--init");

// CJK ideographs, kana, CJK punctuation, fullwidth forms, Hangul.
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/u;
const LETTER = /\p{L}/u;
const ATTRS = new Set(["title", "aria-label", "placeholder", "alt", "label"]);

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "i18n" || entry.name === "testSupport") continue;
      files.push(...sourceFiles(path));
    } else if (/\.(vue|ts|js|mjs|css|html)$/.test(entry.name) && !/\.test\.[cm]?[jt]s$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function countCjk(source) {
  return source.split("\n").filter((line) => CJK.test(line)).length;
}

// Walks the top-level <template> block with a small tag scanner that respects quoted attribute
// values, so `@click="a > b"` is not mistaken for a text node.
function countTemplateLiterals(source) {
  const start = source.search(/^<template\b[^>]*>/m);
  const end = source.lastIndexOf("</template>");
  if (start < 0 || end < start) return 0;
  const body = source.slice(source.indexOf(">", start) + 1, end);
  let literals = 0;
  let text = "";
  const flush = () => {
    if (LETTER.test(text.replace(/\{\{[\s\S]*?\}\}/g, ""))) literals += 1;
    text = "";
  };
  for (let i = 0; i < body.length; ) {
    if (body.startsWith("<!--", i)) {
      const close = body.indexOf("-->", i);
      i = close < 0 ? body.length : close + 3;
    } else if (body[i] === "<" && /[A-Za-z/]/.test(body[i + 1] ?? "")) {
      flush();
      let j = i + 1;
      let quote = "";
      while (j < body.length && (quote || body[j] !== ">")) {
        if (quote) {
          if (body[j] === quote) quote = "";
        } else if (body[j] === '"' || body[j] === "'") {
          quote = body[j];
        }
        j += 1;
      }
      const tag = body.slice(i, j);
      for (const match of tag.matchAll(/\s([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        if (ATTRS.has(match[1]) && LETTER.test(match[2] ?? match[3] ?? "")) literals += 1;
      }
      i = j + 1;
    } else {
      text += body[i];
      i += 1;
    }
  }
  flush();
  return literals;
}

function measure(path) {
  const source = readFileSync(path, "utf8");
  return { cjk: countCjk(source), literals: path.endsWith(".vue") ? countTemplateLiterals(source) : 0 };
}

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const ignored = new Set((budget.ignore ?? []).map((entry) => entry.file));
const files = [...sourceFiles(join(root, "src")), join(root, "index.html")]
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
  const current = measure(join(root, file));
  const entry = budget.files[file];
  for (const key of ["cjk", "literals"]) {
    const limit = entry?.[key] ?? 0;
    if (current[key] > limit && !(init && !entry)) problems.push(`${file}: ${key} ${current[key]} exceeds budget ${limit}`);
    else if (current[key] < limit) lowered.push({ file, key, from: limit, to: current[key] });
  }
  if (update && !problems.length) {
    if (entry) {
      const next = { cjk: Math.min(entry.cjk ?? 0, current.cjk), literals: Math.min(entry.literals ?? 0, current.literals) };
      if (next.cjk || next.literals) budget.files[file] = next;
      else delete budget.files[file];
    } else if (init && (current.cjk || current.literals)) {
      budget.files[file] = current;
      added.push(file);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("FAIL: i18n literal budget check");
  process.exit(1);
}

if (update) {
  const sorted = Object.fromEntries(Object.entries(budget.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(budgetPath, `${JSON.stringify({ ...budget, files: sorted }, null, 2)}\n`);
  console.log(`budget updated (${lowered.length} value(s) lowered, ${added.length} file(s) added)`);
} else {
  for (const change of lowered) console.log(`below budget: ${change.file} ${change.key} ${change.to} < ${change.from} (run check:i18n-literals -- --update)`);
  const totals = Object.values(budget.files).reduce((sum, e) => ({ cjk: sum.cjk + e.cjk, literals: sum.literals + e.literals }), { cjk: 0, literals: 0 });
  console.log(`OK: i18n literal budget (${Object.keys(budget.files).length} file(s), ${totals.cjk} CJK line(s), ${totals.literals} template literal(s) allowed)`);
}
