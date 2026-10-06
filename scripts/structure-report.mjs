// Structure report for src/, test/ and web/src (structure-followup plan H0.2/H0.3). Report only, never fails.
//
//   node scripts/structure-report.mjs                 files over 400/300 lines, folders over 15 files
//   node scripts/structure-report.mjs --base master   also: files that kept their master counterpart (git
//                                                     rename detection) and are bigger than it was there
//
// Counts are newline counts (as `wc -l`). Test files are listed but marked.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseIdx = process.argv.indexOf("--base");
const base = baseIdx > -1 ? process.argv[baseIdx + 1] : null;

const counts = new Map();
function walk(dir, pattern) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(full, pattern);
    } else if (pattern.test(entry.name)) {
      counts.set(relative(root, full).split(sep).join("/"), readFileSync(full, "utf8").split("\n").length - 1);
    }
  }
}
walk(join(root, "src"), /\.ts$/);
walk(join(root, "test"), /\.ts$/);
walk(join(root, "web", "src"), /\.(vue|ts)$/);

const isTest = (f) => /\.test\.ts$/.test(f) || f.startsWith("test/") || f.includes("/testSupport/");
const rows = [...counts].sort((a, b) => b[1] - a[1]);

function section(title, min) {
  const hit = rows.filter(([, n]) => n > min);
  console.log(`\n${title} (${hit.length})`);
  for (const [f, n] of hit) console.log(`  ${String(n).padStart(5)}  ${f}${isTest(f) ? "  [test]" : ""}`);
}
section("Over 400 lines", 400);
section("Over 300 lines", 300);

const perDir = new Map();
for (const f of counts.keys()) {
  if (/\.test\.ts$/.test(f)) continue;
  perDir.set(dirname(f), (perDir.get(dirname(f)) ?? 0) + 1);
}
const crowded = [...perDir].filter(([, n]) => n > 15).sort((a, b) => b[1] - a[1]);
console.log(`\nFolders with more than 15 non-test files (${crowded.length})`);
for (const [d, n] of crowded) console.log(`  ${String(n).padStart(5)}  ${d}`);

if (base) {
  const out = execFileSync("git", ["diff", "-M", "--name-status", `${base}...HEAD`], { cwd: root, encoding: "utf8" });
  const grown = [];
  for (const line of out.split("\n")) {
    const [status, from, to] = line.split("\t");
    if (!status?.startsWith("R") || !counts.has(to)) continue;
    let before;
    try {
      before = execFileSync("git", ["show", `${base}:${from}`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").length - 1;
    } catch {
      continue;
    }
    if (counts.get(to) > before) grown.push([to, before, counts.get(to), from]);
  }
  grown.sort((a, b) => b[2] - b[1] - (a[2] - a[1]));
  console.log(`\nMoved from ${base} and bigger than before (${grown.length})`);
  for (const [to, before, now, from] of grown.slice(0, 40)) console.log(`  ${before} -> ${now}  ${to}  (was ${from})`);
}
