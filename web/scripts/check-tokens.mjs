// The `@theme` in src/shared/styles/tokens.css is the only source of font sizes, radii, shadows, z-indexes, breakpoints and
// colors. Per file this counts `var(--ws-` reads and arbitrary values (text-[..], rounded-[..], shadow-[..], z-[..],
// min-[..]:). Everything but plain `arbitrary` fails on any hit, `arbitrary` is a ratchet in token-budget.json that `--update`
// lowers.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgetPath = join(root, "scripts", "token-budget.json");
const update = process.argv.includes("--update");
const KEYS = ["ws", "fontSize", "radius", "shadow", "zIndex", "viewport", "arbitrary"];

// Utility with an arbitrary value: `name-[value]`. A variant (`data-[state=on]:`,
// `min-[740px]:`) is followed by `:` and is not a value.
const ARBITRARY = /(?<![\w[-])(-?[a-z][\w-]*)-\[([^\]\s"'`]+)\](?!:)/g;
const FONT_SIZE = /^text$/;
const RADIUS = /^rounded(?:-[a-z]{1,2})?$/;

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "testSupport") files.push(...sourceFiles(path));
    } else if (/\.(vue|css|ts)$/.test(entry) && !entry.endsWith(".test.ts") && entry !== "tokens.css") {
      files.push(path);
    }
  }
  return files;
}

function count(source) {
  const result = Object.fromEntries(KEYS.map((key) => [key, 0]));
  result.ws = (source.match(/var\(--ws-/g) ?? []).length;
  result.viewport = (source.match(/(?<![\w[-])(?:min|max)-\[[\d.]+px\]:/g) ?? []).length;
  for (const [, name, value] of source.matchAll(ARBITRARY)) {
    if (FONT_SIZE.test(name) && /^[\d.]+(?:px|rem|em)$/.test(value)) result.fontSize += 1;
    else if (RADIUS.test(name)) result.radius += 1;
    else if (name === "shadow") result.shadow += 1;
    else if (name === "z") result.zIndex += 1;
    else result.arbitrary += 1;
  }
  return result;
}

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const files = sourceFiles(join(root, "src"))
  .map((path) => relative(root, path).split("\\").join("/"))
  .sort();
const problems = [];
const lowered = [];
const totals = Object.fromEntries(KEYS.map((key) => [key, 0]));

for (const file of Object.keys(budget.files)) {
  if (!files.includes(file)) problems.push(`${file}: listed in the budget but no longer exists (remove the entry)`);
}

for (const file of files) {
  const entry = budget.files[file] ?? {};
  const current = count(readFileSync(join(root, file), "utf8"));
  for (const key of KEYS) {
    totals[key] += current[key];
    const limit = key === "arbitrary" ? (entry[key] ?? 0) : 0;
    if (current[key] > limit) problems.push(`${file}: ${key} ${current[key]} exceeds budget ${limit}`);
    else if (current[key] < limit) lowered.push({ file, key, from: limit, to: current[key] });
  }
  if (update && !problems.length) {
    if (current.arbitrary) budget.files[file] = { arbitrary: current.arbitrary };
    else delete budget.files[file];
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("FAIL: token check");
  process.exit(1);
}

if (update) {
  writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`budget updated (${lowered.length} value(s) lowered)`);
} else {
  for (const change of lowered)
    console.log(`below budget: ${change.file} ${change.key} ${change.to} < ${change.from} (run check:tokens -- --update)`);
  console.log(`OK: tokens (${KEYS.map((key) => `${key} ${totals[key]}`).join(", ")}; the arbitrary budget only shrinks)`);
}
