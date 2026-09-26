// Literal-color budget (a ratchet). For every .vue file under src/ it counts
//   colors          hex, rgb()/rgba(), hsl()/hsla(), hwb(), oklch(), oklab() literals
//   themeSelectors  `data-theme` references (dark-mode override rules that the
//                   design tokens make unnecessary)
// and fails when a count exceeds the file's budget in scripts/style-budget.json.
// Files without an entry have a budget of 0.
//
//   npm run check:styles            check
//   npm run check:styles -- --update  lower budgets to the current counts
//                                     (never raises one; run it in the same
//                                     commit as the migration that lowered them)
//
// An entry may carry `allow`:
//   { "literal": "#000", "reason": "..." }   matching literals are not counted
//   { "region": "name", "reason": "..." }    literals between the markers
//                                            `style-budget: allow name` and `style-budget: end`
//                                            (put each in a comment, CSS or JS) are not counted
// Every allow entry needs a reason. A region entry needs its markers in the file and the
// other way around, and the exempted literals are counted in the output so they stay visible.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgetPath = join(root, "scripts", "style-budget.json");
const update = process.argv.includes("--update");

// `(?<![\w&])` skips `host#39087` and `&#123;`; hex lengths 3, 4, 6 and 8 only.
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FUNCTIONAL = /\b(?:rgba?|hsla?|hwb|oklch|oklab)\(/g;
const THEME = /data-theme/g;

function vueFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...vueFiles(path));
    else if (entry.endsWith(".vue")) files.push(path);
  }
  return files;
}

const REGION = /style-budget: allow (\S+)[\s\S]*?style-budget: end/g;

function literalsIn(text) {
  return [...(text.match(HEX) ?? []), ...(text.match(FUNCTIONAL) ?? [])];
}

// Returns the counts and the names of the regions found in the source.
function count(source, allow) {
  const allowed = new Set(allow.filter((entry) => entry.literal).map((entry) => entry.literal.toLowerCase()));
  const regions = [];
  let exempted = 0;
  const outside = source.replace(REGION, (block, name) => {
    regions.push(name);
    exempted += literalsIn(block).length;
    return "";
  });
  const unmatched = (source.match(/style-budget: allow /g) ?? []).length !== (source.match(/style-budget: end/g) ?? []).length;
  return {
    colors: literalsIn(outside).filter((literal) => !allowed.has(literal.toLowerCase())).length,
    themeSelectors: (outside.match(THEME) ?? []).length,
    regions,
    exempted,
    unmatched,
  };
}

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const files = vueFiles(join(root, "src")).map((path) => relative(root, path).split("\\").join("/")).sort();
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
  if (current.unmatched) problems.push(`${file}: a "style-budget: allow" marker has no matching "style-budget: end"`);
  for (const name of current.regions) if (!declared.includes(name)) problems.push(`${file}: region "${name}" is not listed in the budget's allow entries`);
  for (const name of declared) if (!current.regions.includes(name)) problems.push(`${file}: allow entry for region "${name}" has no markers in the file`);
  if (current.exempted) notes.push(`${file}: ${current.exempted} literal(s) exempted by ${current.regions.length} region(s)`);
  for (const key of ["colors", "themeSelectors"]) {
    const limit = entry[key] ?? 0;
    if (current[key] > limit) problems.push(`${file}: ${key} ${current[key]} exceeds budget ${limit}`);
    else if (current[key] < limit) lowered.push({ file, key, from: limit, to: current[key] });
  }
  if (update && !problems.length) {
    const next = { ...entry, colors: current.colors, themeSelectors: current.themeSelectors };
    if (next.colors || next.themeSelectors || next.allow?.length) budget.files[file] = next;
    else delete budget.files[file];
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("FAIL: style budget check");
  process.exit(1);
}

if (update) {
  writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`budget updated (${lowered.length} value(s) lowered)`);
} else {
  for (const note of notes) console.log(`allowed: ${note}`);
  for (const change of lowered) console.log(`below budget: ${change.file} ${change.key} ${change.to} < ${change.from} (run check:styles -- --update)`);
  console.log("OK: style budget");
}
