// Key-parity check for every i18n module under src/.
//
//   npm run check:i18n
//
// Discovers modules by glob: any i18n folder under src/ that holds an index.ts is a module (a language
// is a `<code>.ts` file in it, none is named here; a language missing from one folder fails), wherever it lives (src/i18n/<name>/ today, later
// src/features/<x>/i18n/ and src/shared/i18n/common/). A module is named after its folder,
// or after the parent folder when the folder is itself called i18n.
// Walks every module folder (common, join, room, admin, demo — one t() lookup shares all
// five since step 8.4/8.5 wired admin and demo onto it too, per useI18n.ts), reads each
// language file as text and collects the keys it declares itself (top-level `key:` entries).
// `join`, `room` and `admin` spread `...en` (per module), so their de/ru/ja always hold every
// en key that module declares at runtime; `common` and `demo` do not spread and are fully
// standalone in all five languages. The text scan is what shows which keys a language file
// actually translates itself, regardless of which shape a module uses.
//
// Step 8.6 resolved every key name that used to collide across modules (folded the
// identical-value ones into `common`, renamed the rest), so a key must now be declared in
// exactly one module: this fails on a duplicate the same way it fails on a language missing
// a key another language in the same module has.
// Nothing is fixed automatically.
//
// There is no allowance: a key missing from any language fails (translate it). The value rules
// (placeholders, CJK, English repeats) are checked by keyParity.test.ts.
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LANGUAGE = "en";
const KEY = /^ {2}(?:([A-Za-z_$][\w$]*)|"([^"]+)"):/gm;

// A module folder is an i18n folder (or one directly inside it, like shared/i18n/common) with an index.ts. A language is
// a `<code>.ts` file in a module folder: nothing here names one.
const NOT_LANGUAGES = new Set(["index"]);
function findModuleDirs(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")).map((entry) => entry.name.slice(0, -3));
  const inI18n = basename(dir) === "i18n" || basename(dirname(dir)) === "i18n";
  const found = files.includes("index") && inI18n ? [dir] : [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "node_modules") found.push(...findModuleDirs(join(dir, entry.name)));
  }
  return found;
}

const moduleDirs = new Map();
for (const dir of findModuleDirs(join(root, "src"))) {
  const name = basename(dir) === "i18n" ? basename(dirname(dir)) : basename(dir);
  if (moduleDirs.has(name)) {
    console.error(`FAIL: two i18n modules are both named "${name}": ${moduleDirs.get(name)} and ${dir}`);
    process.exit(1);
  }
  moduleDirs.set(name, dir);
}

const codesIn = (dir) => readdirSync(dir).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts")).map((file) => file.slice(0, -3)).filter((code) => !NOT_LANGUAGES.has(code));
const languages = [...new Set([...moduleDirs.values()].flatMap(codesIn))].sort((a, b) => (a === DEFAULT_LANGUAGE ? -1 : b === DEFAULT_LANGUAGE ? 1 : a.localeCompare(b)));
let incomplete = 0;
for (const [name, dir] of moduleDirs) {
  for (const language of languages) {
    if (!codesIn(dir).includes(language)) {
      console.error(`FAIL: module "${name}" has no ${language}.ts (a language needs a file in every i18n folder)`);
      incomplete++;
    }
  }
}
if (!languages.includes(DEFAULT_LANGUAGE)) {
  console.error(`FAIL: no ${DEFAULT_LANGUAGE}.ts found, the default language is required`);
  process.exit(1);
}
const modules = [...moduleDirs.keys()].sort();

// module -> language -> declared keys
const declared = Object.fromEntries(modules.map((module) => [
  module,
  Object.fromEntries(languages.map((language) => {
    const source = readFileSync(join(moduleDirs.get(module), `${language}.ts`), "utf8");
    return [language, new Set([...source.matchAll(KEY)].map((match) => match[1] ?? match[2]))];
  })),
]));

let problems = incomplete;

// A key declared by more than one module, for the same language, is a real bug: whichever
// module a merge (useI18n.ts's lookup()) checks first would silently win, hiding the other's
// value. Checked across all five modules together, not per pair.
for (const language of languages) {
  const seenIn = new Map();
  for (const module of modules) {
    for (const key of declared[module][language]) {
      if (seenIn.has(key)) {
        console.error(`FAIL: "${key}" (${language}) is declared in both ${seenIn.get(key)}/ and ${module}/`);
        problems++;
      } else {
        seenIn.set(key, module);
      }
    }
  }
}

let missing = 0;
for (const module of modules) {
  const keys = Object.fromEntries(languages.map((language) => [language, declared[module][language]]));
  const union = new Set(languages.flatMap((language) => [...keys[language]]));
  console.log(`${module}:`);
  for (const language of languages) {
    const gaps = [...union].filter((key) => !keys[language].has(key)).sort();
    missing += gaps.length;
    console.log(`  ${language}: ${keys[language].size} keys, ${gaps.length} missing`);
    for (const key of gaps) {
      console.error(`FAIL: ${module}/${language}: "${key}" is missing, translate it`);
      problems++;
    }
  }
}
console.log(`\n${modules.length} modules, ${missing} missing key(s), ${problems} problem(s)`);
if (problems > 0) {
  console.error("FAIL");
  process.exit(1);
}
console.log("OK: no key is missing in any language, no key is declared twice");
