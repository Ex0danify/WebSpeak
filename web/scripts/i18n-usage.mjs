// Read-only report: which files use each i18n key, and which feature should own it.
//
//   npm run i18n:usage                 # summary per owner + keys that would change module
//   npm run i18n:usage -- --keys       # also list every key with its consuming files
//   npm run i18n:usage -- --owner=voice --keys
//   npm run i18n:usage -- --json
//
// A key counts as used by a file when its name appears there as a quoted string literal
// ('key', "key" or `key`). That covers t('key') and also keys held in maps or props
// (labelKey: 'key'), which a t()-only scan would miss. Test files and the i18n module folders
// themselves are not consumers. Keys built at runtime (t(`prefix${x}`)) cannot be seen; they
// are listed as "dynamic" call sites so a person can check them by hand.
//
// Owner rule (structure-plan S0.6): one consuming feature -> that feature; several -> common;
// none -> unused. A file's feature comes from its path, in either the old layout
// (components/<x>/, composables/voice/, stores/voiceX, views/XView.vue) or the new one
// (features/<x>/, shared/). Nothing is changed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const languages = ["zh", "en", "de", "ru", "ja"];
const KEY = /^ {2}(?:([A-Za-z_$][\w$]*)|"([^"]+)"):/gm;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const all = walk(srcDir).map((file) => relative(srcDir, file).split(sep).join("/"));

// i18n modules: every folder holding an index.ts next to <lang>.ts files, old or relocated.
const moduleDirs = [...new Set(all
  .filter((file) => /(^|\/)i18n\/(?:[^/]+\/)?zh\.ts$/.test(file))
  .map((file) => dirname(file)))].sort();

// key -> { module, languages declared in }
const keys = new Map();
for (const dir of moduleDirs) {
  const moduleName = dir.replace(/^(?:.*\/)?i18n\/?/, "") || basename(dirname(dir));
  const label = dir.includes("features/") || dir.includes("shared/") ? dir.replace(/\/i18n(\/|$)/, "$1").replace(/\/$/, "") : moduleName;
  for (const language of languages) {
    const path = join(srcDir, dir, `${language}.ts`);
    let source;
    try { source = readFileSync(path, "utf8"); } catch { continue; }
    for (const match of source.matchAll(KEY)) {
      const key = match[1] ?? match[2];
      const entry = keys.get(key) ?? { module: label, dir };
      keys.set(key, entry);
    }
  }
}

const isConsumer = (file) =>
  /\.(vue|ts)$/.test(file)
  && !/\.(test|spec)\.ts$/.test(file)
  && !file.includes("/test-support/")
  && !moduleDirs.some((dir) => file.startsWith(`${dir}/`))
  && !/(^|\/)i18n\/useI18n\.ts$/.test(file);

/** The feature a source file belongs to, from its path. */
function featureOf(file) {
  let m;
  if ((m = file.match(/^features\/([^/]+)\//))) return m[1];
  if (file.startsWith("shared/")) return "shared";
  if ((m = file.match(/^components\/(admin|join|demo)\//))) return m[1];
  if (file.startsWith("components/room/")) return /ScreenShare/.test(file) ? "screenShare" : "room";
  if (file.startsWith("shared/ui/")) return "shared";
  if ((m = file.match(/^views\/(Admin|Demo|Room|Join)View?\.vue$/))) return { Admin: "admin", Demo: "demo", Room: "room", Join: "join" }[m[1]];
  if (file.startsWith("composables/voice/")) {
    if (/screenShare|ScreenShare/.test(file)) return "screenShare";
    if (/useConnection|useSessionActions|message-router|ice-servers|voiceSession/.test(file)) return "session";
    return "voice";
  }
  if (/ScreenShare/.test(file)) return "screenShare";
  if (/(^|\/)(useJoinForm)/.test(file)) return "join";
  if (/(^|\/)(useTheme|useToast|useMediaQuery)/.test(file) || file.startsWith("lib/") || file.startsWith("services/")) return "shared";
  if (file.startsWith("stores/admin")) return "admin";
  if (file.startsWith("stores/voiceScreenShare")) return "screenShare";
  if (file.startsWith("stores/voiceAudioStore")) return "voice";
  if (file.startsWith("stores/voiceSession")) return "session";
  return "room"; // remaining composables (chat, members, whisper, ...) all serve the room
}

const consumers = all.filter(isConsumer).map((file) => ({ file, text: readFileSync(join(srcDir, file), "utf8") }));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const report = [];
for (const [key, info] of [...keys].sort(([a], [b]) => a.localeCompare(b))) {
  const pattern = new RegExp(`(['"\`])${escape(key)}\\1`);
  const files = consumers.filter(({ text }) => pattern.test(text)).map(({ file }) => file);
  const features = [...new Set(files.map(featureOf))].sort();
  const owner = features.length === 0 ? "unused" : features.length === 1 ? features[0] : "common";
  report.push({ key, module: info.module, owner, features, files });
}

// Calls whose first argument is not a plain string literal.
const dynamic = [];
for (const { file, text } of consumers) {
  text.split("\n").forEach((line, index) => {
    for (const m of line.matchAll(/(?<![\w.$])t\(\s*(`[^`]*\$\{|[A-Za-z_$][\w$.]*\s*[),])/g)) {
      dynamic.push(`${file}:${index + 1}  ${m[0].trim()}`);
    }
  });
}

const ownerFilter = option("owner");
const shown = ownerFilter ? report.filter((row) => row.owner === ownerFilter) : report;

if (flag("json")) {
  console.log(JSON.stringify({ keys: shown, dynamic }, null, 2));
  process.exit(0);
}

const byOwner = new Map();
for (const row of report) byOwner.set(row.owner, [...(byOwner.get(row.owner) ?? []), row]);
console.log(`${report.length} keys in ${moduleDirs.length} module(s): ${moduleDirs.join(", ")}\n`);
console.log("owner            keys   (of which in a different module today)");
for (const [owner, rows] of [...byOwner].sort(([a], [b]) => a.localeCompare(b))) {
  const moving = rows.filter((row) => row.module !== owner && !(owner === "common" && row.module === "common")).length;
  console.log(`${owner.padEnd(16)} ${String(rows.length).padStart(4)}   ${moving}`);
}

console.log("\nkeys whose owner differs from their module today:");
const moves = shown.filter((row) => row.owner !== "unused" && row.module !== row.owner);
const grouped = new Map();
for (const row of moves) grouped.set(`${row.module} -> ${row.owner}`, [...(grouped.get(`${row.module} -> ${row.owner}`) ?? []), row.key]);
for (const [move, list] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${move} (${list.length}): ${list.join(", ")}`);
}
if (moves.length === 0) console.log("  none");

const unused = shown.filter((row) => row.owner === "unused");
console.log(`\nunused (no literal reference found): ${unused.length}${unused.length ? `\n  ${unused.map((r) => r.key).join(", ")}` : ""}`);
console.log(`\ndynamic t() call sites (check by hand): ${dynamic.length}${dynamic.length ? `\n  ${dynamic.join("\n  ")}` : ""}`);

if (flag("keys")) {
  console.log("\nper key:");
  for (const row of shown) console.log(`  ${row.key} [${row.module}] -> ${row.owner}\n${row.files.map((f) => `      ${f}`).join("\n")}`);
}
