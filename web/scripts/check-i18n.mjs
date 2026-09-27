// Key-parity check for every i18n module under src/i18n/.
//
//   npm run check:i18n
//
// Walks every module folder (common, join, room, admin, demo — one t() lookup shares all
// five since step 8.4/8.5 wired admin and demo onto it too, per use-i18n.ts), reads each
// language file as text and collects the keys it declares itself (top-level `key:` entries).
// `join`, `room` and `admin` spread `...en` (per module), so their de/ru/ja always hold every
// en key that module declares at runtime; `common` and `demo` do not spread and are fully
// standalone in all five languages. The text scan is what shows which keys a language file
// actually translates itself, regardless of which shape a module uses.
//
// Step 8.6 resolved every key name that used to collide across modules (folded the
// identical-value ones into `common`, renamed the rest), so a key must now be declared in
// exactly one module: this fails on a duplicate the same way it fails on a language missing
// a key another language in the same module has. Gaps are tracked per module (known-gaps.json
// is keyed by module, then language) because each module is its own independently-translated
// vocabulary — a language can be complete in `demo` while still missing most of `admin`.
// Nothing is fixed automatically.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const i18nDir = join(root, "src", "i18n");
const modules = ["common", "join", "room", "admin", "demo"];
const languages = ["zh", "en", "de", "ru", "ja"];
const KEY = /^ {2}(?:([A-Za-z_$][\w$]*)|"([^"]+)"):/gm;

// module -> language -> declared keys
const declared = Object.fromEntries(modules.map((module) => [
  module,
  Object.fromEntries(languages.map((language) => {
    const source = readFileSync(join(i18nDir, module, `${language}.ts`), "utf8");
    return [language, new Set([...source.matchAll(KEY)].map((match) => match[1] ?? match[2]))];
  })),
]));

let problems = 0;

// A key declared by more than one module, for the same language, is a real bug: whichever
// module a merge (use-i18n.ts's lookup()) checks first would silently win, hiding the other's
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
    for (const key of gaps) console.log(`    - ${key}`);
  }
}

console.log(`\n${modules.length} modules, ${missing} missing translation key(s) combined, ${problems} duplicate declaration(s)`);
if (missing > 0 || problems > 0) {
  console.error("FAIL");
  process.exit(1);
}
console.log("OK: every module declares the same keys across its own languages, with no key declared twice");
