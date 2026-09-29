// View-composition budget (a ratchet). For every top-level view file under
// src/views/*.vue it counts
//   classAttrs      class="..." attributes
//   classBindings   :class="..." bindings
//   styleLines      lines inside <style scoped> ... </style>
// and fails when a count exceeds the file's budget in scripts/view-budget.json.
// Files without an entry have a budget of 0.
//
//   npm run check:view-composition              check
//   npm run check:view-composition -- --update  lower budgets to the current counts
//                                                (never raises one; run it in the same
//                                                commit as the extraction that lowered them)
//
// An entry may carry `allow`:
//   { "literal": "class=\"...\"", "reason": "..." }  matching literals are not counted
//   { "region": "name", "reason": "..." }            everything between the markers
//                                                     `view-budget: allow name` and `view-budget: end`
//                                                     (put each in a template/script/style comment)
//                                                     is not counted
// Every allow entry needs a reason. A region entry needs its markers in the file and the
// other way around, and the exempted counts are shown in the output so they stay visible.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgetPath = join(root, "scripts", "view-budget.json");
const update = process.argv.includes("--update");

const CLASS_ATTR = /\bclass="/g;
const CLASS_BIND = /:class="/g;
const STYLE_BLOCK = /<style scoped>([\s\S]*?)<\/style>/;
const REGION = /view-budget: allow (\S+)[\s\S]*?view-budget: end/g;

function viewFiles(dir) {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".vue") && statSync(join(dir, entry)).isFile())
    .map((entry) => join(dir, entry));
}

function countIn(text) {
  return {
    classAttrs: (text.match(CLASS_ATTR) ?? []).length,
    classBindings: (text.match(CLASS_BIND) ?? []).length,
  };
}

// Returns the counts and the names of the regions found in the source.
function count(source, allow) {
  const literalAllow = allow.filter((entry) => entry.literal);
  const regions = [];
  let exempted = 0;
  const outside = source.replace(REGION, (block, name) => {
    regions.push(name);
    const blockCounts = countIn(block);
    const styleMatch = block.match(STYLE_BLOCK);
    exempted += blockCounts.classAttrs + blockCounts.classBindings + (styleMatch ? styleMatch[1].split("\n").length : 0);
    return "";
  });
  const unmatched = (source.match(/view-budget: allow /g) ?? []).length !== (source.match(/view-budget: end/g) ?? []).length;

  let { classAttrs, classBindings } = countIn(outside);
  for (const entry of literalAllow) {
    const re = new RegExp(entry.literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const matches = (outside.match(re) ?? []).length;
    if (entry.literal.startsWith(":class=")) classBindings -= matches;
    else classAttrs -= matches;
  }

  const styleMatch = outside.match(STYLE_BLOCK);
  const styleLines = styleMatch ? styleMatch[1].split("\n").length : 0;

  return { classAttrs, classBindings, styleLines, regions, exempted, unmatched };
}

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const files = viewFiles(join(root, "src", "views")).map((path) => relative(root, path).split("\\").join("/")).sort();
const problems = [];
const lowered = [];
const notes = [];

for (const [file, entry] of Object.entries(budget.files)) {
  for (const allow of entry.allow ?? []) {
    if (!allow.reason || !allow.reason.trim()) problems.push(`${file}: allow entry "${allow.literal ?? allow.region}" has no reason`);
    if (!allow.literal && !allow.region) problems.push(`${file}: allow entry needs a "literal" or a "region"`);
  }
  if (!files.includes(file)) problems.push(`${file}: listed in the budget but no longer exists (remove the entry)`);
}

for (const file of files) {
  const entry = budget.files[file] ?? {};
  const current = count(readFileSync(join(root, file), "utf8"), entry.allow ?? []);
  const declared = (entry.allow ?? []).filter((allow) => allow.region).map((allow) => allow.region);
  if (current.unmatched) problems.push(`${file}: a "view-budget: allow" marker has no matching "view-budget: end"`);
  for (const name of current.regions) if (!declared.includes(name)) problems.push(`${file}: region "${name}" is not listed in the budget's allow entries`);
  for (const name of declared) if (!current.regions.includes(name)) problems.push(`${file}: allow entry for region "${name}" has no markers in the file`);
  if (current.exempted) notes.push(`${file}: ${current.exempted} count(s) exempted by ${current.regions.length} region(s)`);
  for (const key of ["classAttrs", "classBindings", "styleLines"]) {
    const limit = entry[key] ?? 0;
    if (current[key] > limit) problems.push(`${file}: ${key} ${current[key]} exceeds budget ${limit}`);
    else if (current[key] < limit) lowered.push({ file, key, from: limit, to: current[key] });
  }
  if (update && !problems.length) {
    const next = { ...entry, classAttrs: current.classAttrs, classBindings: current.classBindings, styleLines: current.styleLines };
    if (next.classAttrs || next.classBindings || next.styleLines || next.allow?.length) budget.files[file] = next;
    else delete budget.files[file];
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("FAIL: view composition budget");
  process.exit(1);
}

if (update) {
  writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`budget updated (${lowered.length} value(s) lowered)`);
} else {
  for (const note of notes) console.log(`allowed: ${note}`);
  for (const change of lowered) console.log(`below budget: ${change.file} ${change.key} ${change.to} < ${change.from} (run check:view-composition -- --update)`);
  console.log("OK: view composition budget");
}
