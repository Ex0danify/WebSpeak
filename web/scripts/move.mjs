// Move files with `git mv` and rewrite every module specifier that points at a moved file.
//
//   node scripts/move.mjs <map.json> [--dry-run]     (run from web/, or anywhere)
//
// The map is a JSON object { "old/path": "new/path" }. Paths are relative to web/src.
// A key that is a directory moves every tracked file under it (a file rule for the same
// path wins over a directory rule). Paths outside web/src are written from the repo root
// with a leading "web/", "e2e/" or "test/".
//
// What is rewritten
//   Every quoted string that starts with "./", "../" or "@/" and resolves to a file
//   (exact, with an extension added, or as a directory index), in every tracked
//   .ts/.tsx/.vue/.mjs/.cjs/.js/.css file outside e2e/legacy/. That covers `from`, dynamic
//   `import()`, `typeof import()`, `vi.mock()`, `vi.importActual()` and `new URL()`.
//   Importers that move get their own relative specifiers fixed too.
//   The keys of scripts/style-budget.json and scripts/view-budget.json ("src/...").
//
// Specifier style
//   Inside web/src, a specifier is relative when importer and target share a unit and "@/..."
//   otherwise. A unit is `features/<name>` or `shared`. When neither end sits in features/ or
//   shared/ (the old layout) the original style, relative or alias, is kept. Outside web/src
//   (e2e, test, scripts) specifiers stay relative. The extension is kept when the original
//   had one (a ".js" suffix on a .ts source stays ".js"); `.vue` always keeps it.
//
// It also lists text files that still mention an old path (build scripts, docs, comments)
// so they can be fixed by hand. --dry-run changes nothing and prints every rewrite.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const webSrc = join(repo, "web", "src");
const CODE_EXT = new Set([".ts", ".tsx", ".vue", ".mjs", ".cjs", ".js", ".css"]);
const RESOLVE_EXT = [".ts", ".tsx", ".vue", ".js", ".mjs", ".json", ".css"];
const BUDGETS = ["web/scripts/style-budget.json", "web/scripts/view-budget.json"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const mapFile = args.find((a) => !a.startsWith("--"));
if (!mapFile) {
  console.error("usage: node scripts/move.mjs <map.json> [--dry-run]");
  process.exit(2);
}

const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28 });
const posix = (p) => p.split(sep).join("/");
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const tracked = git("ls-files", "-z").split("\0").filter(Boolean).map((p) => join(repo, p));

// ---- 1. Build the absolute old -> new map ---------------------------------------------
function abs(p) {
  const root = /^(web|e2e|test)\//.test(p) ? repo : webSrc;
  return resolve(root, p);
}
const rules = Object.entries(JSON.parse(readFileSync(resolve(mapFile), "utf8"))).map(([from, to]) => ({
  from: abs(from),
  to: abs(to),
}));
const moves = new Map();
for (const { from, to } of rules.filter((r) => !isFile(r.from))) {
  const prefix = from + sep;
  const inside = tracked.filter((f) => f.startsWith(prefix));
  if (!inside.length) throw new Error(`nothing tracked under ${relative(repo, from)}`);
  for (const f of inside) moves.set(f, join(to, relative(from, f)));
}
for (const { from, to } of rules.filter((r) => isFile(r.from))) moves.set(from, to);
for (const [from, to] of moves) {
  if (from === to) moves.delete(from);
  else if (existsSync(to) && !moves.has(to)) throw new Error(`destination exists: ${relative(repo, to)}`);
}
const targets = [...moves.values()];
if (new Set(targets).size !== targets.length) throw new Error("two files map to the same destination");
if (!moves.size) {
  console.log("nothing to move");
  process.exit(0);
}
const newPath = (p) => moves.get(p) ?? p;

// ---- 2. Resolve and re-emit specifiers ------------------------------------------------
function resolveSpec(spec, importer) {
  const base = spec.startsWith("@/") ? join(webSrc, spec.slice(2)) : resolve(dirname(importer), spec);
  if (isFile(base)) return { file: base, how: "exact" };
  for (const e of RESOLVE_EXT) if (isFile(base + e)) return { file: base + e, how: "ext" };
  // TypeScript sources imported with a ".js" suffix ("./theme.js" -> theme.ts).
  if (base.endsWith(".js")) for (const e of [".ts", ".tsx"]) if (isFile(base.slice(0, -3) + e)) return { file: base.slice(0, -3) + e, how: "jsext" };
  for (const e of RESOLVE_EXT) if (isFile(join(base, "index" + e))) return { file: join(base, "index" + e), how: "index" };
  return null;
}

function unit(file) {
  const rel = posix(relative(webSrc, file));
  if (rel.startsWith("..")) return null;
  const m = /^(features\/[^/]+|shared)\//.exec(rel);
  return m ? m[1] : "";
}

function emit(spec, importerOld, res, targetOld) {
  const importerNew = newPath(importerOld);
  const targetNew = newPath(targetOld);
  const inWeb = !posix(relative(webSrc, importerNew)).startsWith("..");
  const uNew = unit(importerNew);
  const uTarget = unit(targetNew);
  const layered = [unit(importerOld), unit(targetOld), uNew, uTarget].some((u) => u);
  let alias;
  if (!inWeb) alias = false;
  else if (layered) alias = !(uNew && uNew === uTarget);
  else alias = spec.startsWith("@/");

  const ext = extname(targetNew);
  let tail;
  if (res.how === "jsext") {
    tail = targetNew.slice(0, -ext.length) + ".js";
  } else if (res.how === "index" && /^index\./.test(targetNew.split(sep).pop())) {
    tail = dirname(targetNew);
  } else {
    const keepExt = res.how === "exact" || ext === ".vue";
    tail = keepExt ? targetNew : targetNew.slice(0, -ext.length);
  }
  if (alias) return "@/" + posix(relative(webSrc, tail));
  let rel = posix(relative(dirname(importerNew), tail)) || ".";
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

// Quoted strings that look like module specifiers. A template literal with ${} is skipped.
const SPEC = /(["'`])((?:\.{1,2}\/|@\/)[^"'`\n\\]*?|\.{1,2})\1/g;

const edits = new Map(); // old path -> new content
const report = [];
const unresolved = [];
for (const file of tracked) {
  if (!CODE_EXT.has(extname(file)) || file.includes(`${sep}node_modules${sep}`) || file.includes(`${sep}e2e${sep}legacy${sep}`)) continue;
  const text = readFileSync(file, "utf8");
  let changed = false;
  const out = text.replace(SPEC, (whole, q, spec) => {
    if (q === "`" && spec.includes("${")) return whole;
    const res = resolveSpec(spec, file);
    if (!res) {
      if (moves.has(file) && spec !== "." && spec !== "..") unresolved.push(`${relative(repo, file)}: ${spec}`);
      return whole;
    }
    if (!moves.has(file) && !moves.has(res.file)) return whole;
    const next = emit(spec, file, res, res.file);
    if (next === spec) return whole;
    changed = true;
    report.push(`  ${relative(repo, file)}\n    - ${spec}\n    + ${next}`);
    return q + next + q;
  });
  if (changed) edits.set(file, out);
}

// ---- 3. Budget keys -------------------------------------------------------------------
for (const b of BUDGETS) {
  const file = join(repo, b);
  if (!isFile(file)) continue;
  let text = edits.get(file) ?? readFileSync(file, "utf8");
  let changed = false;
  for (const [from, to] of moves) {
    const key = `"${posix(relative(join(repo, "web"), from))}"`;
    if (!text.includes(key)) continue;
    text = text.replace(key, `"${posix(relative(join(repo, "web"), to))}"`);
    changed = true;
    report.push(`  ${b}\n    - ${key}\n    + "${posix(relative(join(repo, "web"), to))}"`);
  }
  if (changed) edits.set(file, text);
}

// ---- 4. Leftover mentions of old paths (report only) ----------------------------------
const leftovers = [];
const needles = [...moves.keys()].map((f) => posix(relative(repo, f)));
const dirNeedles = new Set(rules.filter((r) => !isFile(r.from)).map((r) => posix(relative(repo, r.from))));
for (const file of tracked) {
  if (file.includes(`${sep}node_modules${sep}`) || /\.(png|jpe?g|ico|woff2?|gz|lock)$/.test(file) || file.endsWith("package-lock.json")) continue;
  const rel = posix(relative(repo, file));
  if (rel.startsWith("docs/design/structure-")) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const hit = [...dirNeedles, ...needles.map((n) => n.replace(/\.[^./]+$/, ""))].find((n) => text.includes(n) || text.includes(n.replace(/^web\//, "")));
  if (hit) leftovers.push(`  ${rel}  (mentions ${hit})`);
}

// ---- 5. Apply or print ----------------------------------------------------------------
console.log(`${moves.size} file(s) to move, ${edits.size} file(s) rewritten`);
if (report.length) console.log("\nrewrites:\n" + report.join("\n"));
if (unresolved.length) console.log("\nunresolved specifiers in moved files (left as is):\n  " + unresolved.join("\n  "));
if (leftovers.length) console.log("\nstill mention an old path (check by hand):\n" + leftovers.join("\n"));
if (dryRun) {
  console.log("\ndry run: nothing changed");
  process.exit(0);
}

for (const [from, to] of moves) {
  mkdirSync(dirname(to), { recursive: true });
  git("mv", relative(repo, from), relative(repo, to));
}
for (const [file, content] of edits) writeFileSync(newPath(file), content);
console.log("\ndone. review with: git diff -M --stat HEAD");
