// Key-parity check for the WebClient translations.
//
//   npm run check:i18n
//
// Reads each language file under src/i18n/webclient/ as text and collects the
// keys it declares itself (top-level `key:` entries). de, ru and ja start from
// `...en`, so at runtime they always hold every en key; the text scan is what
// shows which keys they actually translate. Fails when any language lacks a
// key that another language declares. Nothing is fixed automatically.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src", "i18n", "webclient");
const languages = ["zh", "en", "de", "ru", "ja"];
const KEY = /^ {2}(?:([A-Za-z_$][\w$]*)|"([^"]+)"):/gm;

const keys = Object.fromEntries(languages.map((language) => {
  const source = readFileSync(join(dir, `${language}.ts`), "utf8");
  return [language, new Set([...source.matchAll(KEY)].map((match) => match[1] ?? match[2]))];
}));

const union = new Set(languages.flatMap((language) => [...keys[language]]));
let missing = 0;
for (const language of languages) {
  const gaps = [...union].filter((key) => !keys[language].has(key)).sort();
  missing += gaps.length;
  console.log(`${language}: ${keys[language].size} keys, ${gaps.length} missing`);
  for (const key of gaps) console.log(`  - ${key}`);
}

if (missing > 0) {
  console.error(`\nFAIL: ${missing} missing translation key(s)`);
  process.exit(1);
}
console.log("OK: all languages declare the same keys");
