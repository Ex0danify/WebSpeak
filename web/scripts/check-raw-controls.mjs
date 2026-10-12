// The component library in src/shared/ui is the only place that writes a raw <button>, <input>, <select>, <textarea>, <details>
// or <dialog>, sets a dialog/tab/switch/status role or hand-draws a spinner. Elsewhere a hit needs a reason in
// raw-controls-budget.json, and counts only shrink.

// Restyle check: a library component whose `class` sets color, border, radius, padding or font utilities restyles it at the
// call site. Positioning (margin, width, col-span, flex, alignment) is fine.

// `--update` lowers counts and drops entries that no longer hit, it never raises one.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const OVERRIDE_IS_ERROR = true;
const update = process.argv.includes("--update");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const budgetPath = join(root, "scripts", "raw-controls-budget.json");

const RAW_TAGS = ["button", "input", "select", "textarea", "details", "dialog"];
const RAW_ROLES = ["tab", "tablist", "dialog", "switch", "status"];
const UNSTYLED = new Set(["Icon", "Spinner", "Tabs", "TabPanel", "Toaster"]);
const EXEMPT = (file) => file.startsWith("src/shared/ui/") || file === "src/views/UiGallery.vue" || file.startsWith("src/views/gallery/");

function vueFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...vueFiles(path));
    else if (entry.endsWith(".vue")) files.push(path);
  }
  return files;
}

const rel = (path) => relative(root, path).split("\\").join("/");
const files = vueFiles(src)
  .map((path) => ({ path, file: rel(path) }))
  .sort((a, b) => a.file.localeCompare(b.file));

// Components the library exports: every PascalCase .vue under shared/ui (not shared/ui/shared).
const library = new Set(
  files
    .filter(({ file }) => file.startsWith("src/shared/ui/") && !file.startsWith("src/shared/ui/shared/"))
    .map(({ file }) => file.split("/").pop().replace(".vue", "")),
);

function template(source) {
  const start = source.indexOf("<template>");
  return start < 0 ? "" : source.slice(start);
}

// Opening tags with their raw attribute text, quote-aware (an attribute may contain `>`).
function* openingTags(text) {
  const re = /<([A-Za-z][\w-]*)/g;
  let match;
  while ((match = re.exec(text))) {
    let i = re.lastIndex;
    let quote = null;
    for (; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
    }
    yield { name: match[1], attrs: text.slice(re.lastIndex, i) };
    re.lastIndex = i;
  }
}

const COLOR_NAMES =
  "(?:fg|fg-muted|accent|accent-fg|accent-soft|danger|danger-soft|success|success-soft|warning|warning-soft|surface-[012]|line|line-strong|media[\\w-]*|current|transparent|white|black|inherit)";
const SIZE_NAMES = "(?:2xs|caption|ui|md|flag|display[\\w-]*|xs|sm|base|lg|[2-9]?xl)";
const RESTYLE = new RegExp(
  "^(?:" +
    "bg-.+|border(?:-[trblxy])?(?:-.+)?|rounded(?:-.+)?|p[trblxy]?-.+|" +
    "font-(?:sans|mono|emoji|bold|semibold|medium|normal|light|extrabold|black|thin)|" +
    `text-${COLOR_NAMES}(?:/\\d+)?|text-${SIZE_NAMES}|` +
    "ring(?:-.+)?|shadow(?:-.+)?|outline(?:-.+)?|leading-.+|tracking-.+" +
    ")$",
);

function classTokens(attrs) {
  const tokens = [];
  for (const match of attrs.matchAll(/(?:^|\s):?class="([^"]*)"/g)) {
    // A :class array or object mixes quoted class strings with expressions, the non-class words fall out of the filter.
    for (const word of match[1].replace(/['`]/g, " ").split(/\s+/)) {
      if (/^!?[\w:/.%[\]()-]+$/.test(word)) tokens.push(word);
    }
  }
  return tokens;
}

function restyles(token) {
  if (/[[\]]/.test(token)) {
    // Arbitrary property or value: `bg-[..]`, `p-[..]` restyle; `w-[..]`, `top-[..]` do not.
    const base = token.split(":").pop();
    return RESTYLE.test(base.replace(/\[[^\]]*\]/, "x"));
  }
  const base = token.split(":").pop().replace(/^!/, "");
  return RESTYLE.test(base);
}

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const problems = [];
const warnings = [];
const hits = new Map();

function addHit(file, pattern) {
  const key = `${file}\u0000${pattern}`;
  hits.set(key, (hits.get(key) ?? 0) + 1);
}

for (const { path, file } of files) {
  if (EXEMPT(file)) continue;
  const source = readFileSync(path, "utf8");
  const tpl = template(source);
  for (const { name, attrs } of openingTags(tpl)) {
    if (RAW_TAGS.includes(name)) addHit(file, name);
    // A role on a library component is its own markup passing through, only a native element with a hand-set role is a
    // look-alike.
    for (const role of library.has(name) ? [] : attrs.matchAll(/(?:^|\s)role="([\w-]+)"/g)) {
      if (RAW_ROLES.includes(role[1])) addHit(file, `role=${role[1]}`);
    }
    // Icon and Spinner draw in currentColor, so a text color on them is their API. Tabs, TabPanel and Toaster have no look of
    // their own (Toaster padding is where it sits on screen), so the call site lays them out.
    if (library.has(name) && !UNSTYLED.has(name)) {
      const bad = classTokens(attrs).filter(restyles);
      if (bad.length) warnings.push(`${file}: <${name}> class restyles it (${[...new Set(bad)].join(" ")})`);
    }
    // A hand-drawn spinner (the Spinner component or Button's `loading` draw the rotating arc).
    if (/\banimate-spin\b/.test(attrs)) addHit(file, "spinner");
  }
  // The same patterns in script constants (a class pile in a .ts block still draws a spinner).
  const script = source.match(/<script[\s\S]*?<\/script>/)?.[0] ?? "";
  if (/\banimate-spin\b/.test(script)) addHit(file, "spinner");
}

if (update) {
  budget.entries = budget.entries
    .map((entry) => ({ ...entry, max: Math.min(entry.max, hits.get(`${entry.file}\u0000${entry.pattern}`) ?? 0) }))
    .filter((entry) => entry.max > 0);
  writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
}

const listed = new Map();
for (const entry of budget.entries) {
  const key = `${entry.file}\u0000${entry.pattern}`;
  if (!entry.reason || !String(entry.reason).trim()) problems.push(`${entry.file} (${entry.pattern}): allowlist entry without a reason`);
  if (listed.has(key)) problems.push(`${entry.file} (${entry.pattern}): listed twice`);
  listed.set(key, entry);
}

for (const [key, count] of [...hits].sort()) {
  const [file, pattern] = key.split("\u0000");
  const entry = listed.get(key);
  if (!entry) problems.push(`${file}: ${count} raw ${pattern} not in the allowlist (use the library component)`);
  else if (count > entry.max) problems.push(`${file}: raw ${pattern} ${count} exceeds allowlist ${entry.max}`);
  else if (count < entry.max)
    problems.push(`${file}: raw ${pattern} is down to ${count}, lower the allowlist (${entry.max}) in raw-controls-budget.json`);
}
for (const [key, entry] of listed) {
  if (!hits.has(key)) problems.push(`${entry.file}: allowlist entry for ${entry.pattern} is stale (remove it)`);
}

const total = [...hits.values()].reduce((sum, count) => sum + count, 0);
console.log(
  `raw controls outside the library: ${total} in ${new Set([...hits.keys()].map((key) => key.split("\u0000")[0])).size} files, allowlist ${budget.entries.length} entries`,
);

if (warnings.length) {
  const label = OVERRIDE_IS_ERROR ? "ERROR" : "warn";
  console.log(`${label}: restyle ${warnings.length} library component(s) restyled at the call site`);
  for (const line of warnings) console.log(`  ${line}`);
  if (OVERRIDE_IS_ERROR) problems.push(...warnings);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("FAIL: raw controls check (swap in the library component, or list it in scripts/raw-controls-budget.json with a reason)");
  process.exit(1);
}
console.log("OK: raw controls match the allowlist");
