// Move gateway files with `git mv` and rewrite every module specifier that points at a moved file.
// Root twin of web/scripts/move.mjs (gateway-decompose plan G0.5).
//
//   node scripts/move-gateway.mjs <map.json> [--dry-run]
//
// The map is a JSON object { "old/path": "new/path" }, paths relative to the repo root
// (for example "src/server/voice-bridge.ts": "src/modules/voice/voiceBridge.ts"). A key that is a
// directory moves every tracked file under it (a file rule for the same path wins over a directory
// rule). Refuses to run on a dirty tree unless --dry-run.
//
// What is rewritten
//   Every quoted string that starts with "./" or "../" and resolves to a file (exact, with an
//   extension added, a ".js" suffix standing for a .ts source, or a directory index), in every
//   tracked .ts/.mjs/.cjs/.js file under src/, test/, e2e/ (not e2e/legacy/), scripts/ and in
//   vitest.config.ts. That covers `from`, dynamic `import()`, `vi.mock()` and `new URL()`.
//   Importers that move get their own relative specifiers fixed too. The extension style of the
//   original is kept (a ".js" suffix on a .ts source stays ".js").
//   The keys of scripts/gateway-size-budget.json ("src/...", "test/...").
//
// It also lists text files that still mention an old path (package.json, Dockerfile, docs, string
// paths such as readFileSync("src/server/x.ts")) so they can be fixed by hand.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CODE_EXT = new Set([".ts", ".mjs", ".cjs", ".js"]);
const RESOLVE_EXT = [".ts", ".js", ".mjs", ".json"];
const BUDGETS = ["scripts/gateway-size-budget.json"];
const SCANNED = /^(src|test|e2e|scripts)\/|^vitest\.config\.ts$/;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const mapFile = args.find((a) => !a.startsWith("--"));
if (!mapFile) {
  console.error("usage: node scripts/move-gateway.mjs <map.json> [--dry-run]");
  process.exit(2);
}

const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28 });
const posix = (p) => p.split(sep).join("/");
const isFile = (p) => existsSync(p) && statSync(p).isFile();

if (!dryRun && git("status", "--porcelain").trim()) {
  console.error("refusing to run on a dirty tree; commit or stash first");
  process.exit(1);
}

const tracked = git("ls-files", "-z").split("\0").filter(Boolean).map((p) => join(repo, p));

// ---- 1. Build the absolute old -> new map ---------------------------------------------
const rules = Object.entries(JSON.parse(readFileSync(resolve(mapFile), "utf8"))).map(([from, to]) => ({
  from: resolve(repo, from),
  to: resolve(repo, to),
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
  const base = resolve(dirname(importer), spec);
  if (isFile(base)) return { file: base, how: "exact" };
  for (const e of RESOLVE_EXT) if (isFile(base + e)) return { file: base + e, how: "ext" };
  // TypeScript sources imported with a ".js" suffix ("./theme.js" -> theme.ts).
  if (base.endsWith(".js")) for (const e of [".ts"]) if (isFile(base.slice(0, -3) + e)) return { file: base.slice(0, -3) + e, how: "jsext" };
  for (const e of RESOLVE_EXT) if (isFile(join(base, "index" + e))) return { file: join(base, "index" + e), how: "index" };
  return null;
}

function emit(res, importerOld, targetOld) {
  const importerNew = newPath(importerOld);
  const targetNew = newPath(targetOld);
  const ext = extname(targetNew);
  let tail;
  if (res.how === "jsext") tail = targetNew.slice(0, -ext.length) + ".js";
  else if (res.how === "index") tail = dirname(targetNew);
  else tail = res.how === "exact" ? targetNew : targetNew.slice(0, -ext.length);
  let rel = posix(relative(dirname(importerNew), tail)) || ".";
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

// Quoted strings that look like relative specifiers. A template literal with ${} is skipped.
const SPEC = /(["'`])(\.{1,2}\/[^"'`\n\\]*?|\.{1,2})\1/g;

const edits = new Map(); // old path -> new content
const report = [];
const unresolved = [];
for (const file of tracked) {
  const rel = posix(relative(repo, file));
  if (!CODE_EXT.has(extname(file)) || !SCANNED.test(rel) || rel.startsWith("e2e/legacy/")) continue;
  const text = readFileSync(file, "utf8");
  let changed = false;
  const out = text.replace(SPEC, (whole, q, spec) => {
    if (q === "`" && spec.includes("${")) return whole;
    const res = resolveSpec(spec, file);
    if (!res) {
      if (moves.has(file) && spec !== "." && spec !== "..") unresolved.push(`${rel}: ${spec}`);
      return whole;
    }
    if (!moves.has(file) && !moves.has(res.file)) return whole;
    const next = emit(res, file, res.file);
    if (next === spec) return whole;
    changed = true;
    report.push(`  ${rel}\n    - ${spec}\n    + ${next}`);
    return q + next + q;
  });
  if (changed) edits.set(file, out);
}

// ---- 3. Budget keys -------------------------------------------------------------------
for (const b of BUDGETS) {
  const file = join(repo, b);
  if (!isFile(file)) continue;
  let text = readFileSync(file, "utf8");
  let changed = false;
  for (const [from, to] of moves) {
    const key = `"${posix(relative(repo, from))}"`;
    if (!text.includes(key)) continue;
    const next = `"${posix(relative(repo, to))}"`;
    text = text.replace(key, next);
    changed = true;
    report.push(`  ${b}\n    - ${key}\n    + ${next}`);
  }
  if (changed) edits.set(file, text);
}

// ---- 4. Leftover mentions of old paths (report only) ----------------------------------
const leftovers = [];
const needles = new Set(rules.filter((r) => !isFile(r.from)).map((r) => posix(relative(repo, r.from))));
for (const f of moves.keys()) needles.add(posix(relative(repo, f)).replace(/\.[^./]+$/, ""));
for (const file of tracked) {
  const rel = posix(relative(repo, file));
  if (/\.(png|jpe?g|ico|woff2?|gz|lock)$/.test(file) || rel === "package-lock.json" || rel.startsWith("docs/design/gateway-decompose") || rel.startsWith("e2e/legacy/")) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const hit = [...needles].find((n) => text.includes(n));
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
