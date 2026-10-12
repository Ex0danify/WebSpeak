// Scaffolds a new UI language, `npm run i18n:create <code> [-- --endonym "Français"] [--intl fr-FR] [--flag 🇫🇷] [--dry-run]`.
// It copies each i18n folder's `en.ts` as `<code>.ts` (English values, same order and comments) and `common/<code>.ts` also
// gets the `meta` export. keyParity.test.ts fails until it is translated.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LANGUAGE = "en";
const RESERVED = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "static",
  "await",
  "async",
  "of",
  "as",
  "is",
  "to",
  "do",
]);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { dryRun: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (["--endonym", "--intl", "--flag"].includes(arg)) {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} needs a value`);
      options[arg.slice(2)] = value;
    } else if (arg.startsWith("--")) fail(`unknown option ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) fail("usage: npm run i18n:create <code>   (e.g. fr, pt-BR)");
  return { code: positional[0], options };
}

// Same discovery as check-i18n.mjs.
function findModuleDirs(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const inI18n = basename(dir) === "i18n" || basename(dirname(dir)) === "i18n";
  const found = inI18n && entries.some((entry) => entry.isFile() && entry.name === "index.ts") ? [dir] : [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "node_modules") found.push(...findModuleDirs(join(dir, entry.name)));
  }
  return found;
}

function deriveMeta(code, options) {
  let locale;
  try {
    locale = new Intl.Locale(code);
  } catch {
    fail(`"${code}" is not a valid BCP 47 language tag`);
  }
  const region = locale.region ?? locale.maximize().region;
  const intl = options.intl ?? (region ? `${locale.language}-${region}` : locale.language);
  const endonymRaw = options.endonym ?? new Intl.DisplayNames([code], { type: "language" }).of(code);
  const endonym = endonymRaw ? endonymRaw.charAt(0).toLocaleUpperCase(code) + endonymRaw.slice(1) : code;
  // A flag stands for a country, not a language, so this is a guess from the region and is reported for review.
  const flag =
    options.flag ??
    (region && /^[A-Z]{2}$/.test(region) ? String.fromCodePoint(...[...region].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🌐");
  return { endonym, tag: code, intl, flag };
}

const CJK = /[⺀-鿿豈-﫿＀-￯\u3000-〿가-힯]/;

const { code, options } = parseArgs(process.argv.slice(2));
if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(code)) fail(`"${code}" does not look like a language code (use e.g. fr, pt-BR, zh-Hant)`);
if (code === DEFAULT_LANGUAGE) fail(`"${DEFAULT_LANGUAGE}" is the default language and already exists`);

const moduleDirs = findModuleDirs(join(root, "src")).sort();
if (moduleDirs.length === 0) fail("no i18n folders found under web/src");
const existing = moduleDirs.filter((dir) => existsSync(join(dir, `${code}.ts`)));
if (existing.length > 0) fail(`${code} already exists in: ${existing.map((dir) => relative(root, dir)).join(", ")}. Nothing was written.`);

const meta = deriveMeta(code, options);
if (CJK.test(meta.endonym)) {
  console.warn(
    `WARN: the endonym "${meta.endonym}" contains CJK characters, which keyParity.test.ts and check:i18n-literals forbid; a CJK language needs that rule changed in its own commit.`,
  );
}

// A code that is not an identifier (pt-BR) or is a reserved word (is, as, in ...) is exported as `default`, collectTranslations
// reads either.
const isIdentifier = /^[a-z][a-z0-9]*$/.test(code) && !RESERVED.has(code);
const header = isIdentifier ? `export const ${code}: Record<string, string> = {` : "const messages: Record<string, string> = {";
const footer = isIdentifier ? "};" : "};\n\nexport default messages;";

const EN_HEAD = "export const en = {";
const EN_TAIL = "} satisfies Record<string, string>;";
const META_BLOCK = /\n\/\*\* What the app needs to know about this language[\s\S]*$/;

const plan = moduleDirs.map((dir) => {
  const source = readFileSync(join(dir, `${DEFAULT_LANGUAGE}.ts`), "utf8");
  const start = source.indexOf(`${EN_HEAD}\n`);
  const end = source.indexOf(`\n${EN_TAIL}`);
  if (start === -1 || end === -1)
    fail(`${relative(root, join(dir, "en.ts"))} does not have the expected "${EN_HEAD}" ... "${EN_TAIL}" shape`);
  const body = source.slice(start + EN_HEAD.length + 1, end);
  const keys = [...body.matchAll(/^ {2}(?:[A-Za-z_$][\w$]*|"[^"]+"):/gm)].length;
  let text = `${header}\n${body}\n${footer}\n`;
  if (META_BLOCK.test(source)) {
    text += `\n/** What the app needs to know about this language besides its words (read by languages.ts). */\nexport const meta = ${JSON.stringify(
      meta,
    )
      .replace(/"(\w+)":/g, "$1: ")
      .replace(/,/g, ", ")
      .replace("{", "{ ")
      .replace("}", " }")};\n`;
  }
  return { file: join(dir, `${code}.ts`), text, keys };
});

if (!plan.some((entry) => entry.text.includes("export const meta"))) fail("no en.ts exports `meta`, so the language could not be listed");

let total = 0;
for (const { file, text, keys } of plan) {
  total += keys;
  if (!options.dryRun) writeFileSync(file, text);
  console.log(`${options.dryRun ? "would create" : "created"} ${relative(join(root, ".."), file)} (${keys} keys)`);
}

console.log(`\n${plan.length} files, ${total} keys, all prefilled with the English text.`);
console.log(`meta: ${JSON.stringify(meta)}  (edit the flag/endonym/intl in shared/i18n/common/${code}.ts if wrong)`);
console.log(`\nNext (details: CONTRIBUTING.md, "Translations"):
  1. Translate the values in the ${plan.length} new ${code}.ts files (keep every {{placeholder}}; keep one word per concept, see de.ts).
  2. Words that really are identical to English go in SAME_AS_ENGLISH in web/src/shared/i18n/keyParity.test.ts.
  3. Optional: a welcome-text default for "${code}" in src/modules/admin/siteCopy.ts (falls back to en).
  4. npm --prefix web run check:i18n && npm test   (keyParity fails for every value still equal to English)`);
