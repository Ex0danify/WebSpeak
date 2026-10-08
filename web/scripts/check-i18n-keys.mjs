// Key-usage check (i18n plan I0.4): the code side of the catalog, complementing check-i18n.mjs
// (which only compares the language files with each other).
//
//   npm run check:i18n-keys
//
// FAIL
//   - a statically used key that no module defines. Static uses are t('k') / text('k') calls
//     with a string literal and keyed props such as labelKey: 'k' (label|title|message|text|
//     description|placeholder + Key). A typo otherwise renders the key name on screen.
//   - an err_<CODE> key whose CODE is not a code in src/shared/errors.ts (or messageCodes.ts).
//   - dynamic t() sites that are not pinned in scripts/i18n-dynamic-keys.json, a pinned entry
//     whose file has no dynamic site any more, a pinned key that no module defines, or a pinned
//     key that its source file does not mention (so the enumeration cannot go stale silently).
//   - a defined key with no literal reference anywhere (pinned dynamic keys count as used).
//   - a gateway code without an err_<CODE> key.
//
// A dynamic site is a t( call whose first argument is not a plain string literal. They cannot be
// followed statically, so each file holding one lists the keys it can produce in the registry.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const strict = true;
const KEY = /^ {2}(?:([A-Za-z_$][\w$]*)|"([^"]+)"):/gm;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(full, out);
    } else out.push(full);
  }
  return out;
}

const rel = (file) => relative(srcDir, file).split(sep).join("/");
const files = walk(srcDir).map((file) => ({ file: rel(file), full: file }));

// Defined keys: the union over every language file of every i18n module (parity is check-i18n's job).
const defined = new Set();
// A module folder is an i18n folder holding the default language file; every other `<code>.ts` next to it is a language.
const moduleFolders = new Set(files.filter(({ file }) => /(^|\/)i18n\/(?:[^/]+\/)?en\.ts$/.test(file)).map(({ file }) => file.slice(0, file.lastIndexOf("/"))));
for (const { file, full } of files) {
  if (!moduleFolders.has(file.slice(0, file.lastIndexOf("/"))) || /(^|\/)(index|[^/]+\.test)\.ts$/.test(file)) continue;
  for (const match of readFileSync(full, "utf8").matchAll(KEY)) defined.add(match[1] ?? match[2]);
}

const isConsumer = (file) =>
  /\.(vue|ts)$/.test(file)
  && !/\.(test|spec)\.ts$/.test(file)
  && !file.startsWith("testSupport/")
  && !moduleFolders.has(file.slice(0, file.lastIndexOf("/")));

const consumers = files.filter(({ file }) => isConsumer(file)).map(({ file, full }) => ({ file, text: readFileSync(full, "utf8") }));

const STATIC_CALL = /(?<![\w.$])(?:t|text)\(\s*(['"`])([^'"`$\\\n]+)\1/g;
const KEYED_PROP = /\b(?:label|title|message|text|description|placeholder)Key\s*:\s*(['"`])([^'"`$\\\n]+)\1/g;
// First argument not a quote, or a template literal with an interpolation. `t()` is not a site.
const DYNAMIC_CALL = /(?<![\w.$])t\(\s*(?!['"`)\s])|(?<![\w.$])t\(\s*`[^`]*\$\{/g;

let problems = 0;
const fail = (message) => { console.error(`FAIL: ${message}`); problems++; };
const warn = (message) => console.warn(`WARN: ${message}`);

const used = new Set();
const dynamicByFile = new Map();
for (const { file, text } of consumers) {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const code = line.replace(/\/\/.*$/, "");
    for (const match of code.matchAll(STATIC_CALL)) {
      used.add(match[2]);
      if (!defined.has(match[2])) fail(`${file}:${index + 1}: t("${match[2]}") is not defined in any i18n module`);
    }
    for (const match of code.matchAll(KEYED_PROP)) {
      used.add(match[2]);
      if (!defined.has(match[2])) fail(`${file}:${index + 1}: "${match[2]}" (keyed prop) is not defined in any i18n module`);
    }
    if (!/\bfunction t\(/.test(code) && code.match(DYNAMIC_CALL)) {
      const sites = dynamicByFile.get(file) ?? [];
      sites.push(index + 1);
      dynamicByFile.set(file, sites);
    }
  });
}

// Any quoted literal equal to a key counts as a use too (keys held in maps, props, constants).
const literal = (text, key) => new RegExp(`(['"\`])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`).test(text);
const textOf = new Map(consumers.map(({ file, text }) => [file, text]));

// Dynamic sites and their registry.
const registry = JSON.parse(readFileSync(join(root, "scripts", "i18n-dynamic-keys.json"), "utf8")).sites ?? [];
const pinned = new Map();
for (const entry of registry) {
  if (pinned.has(entry.file)) fail(`i18n-dynamic-keys.json lists ${entry.file} twice`);
  pinned.set(entry.file, entry);
}
for (const [file, lines] of dynamicByFile) {
  if (!pinned.has(file)) fail(`${file}:${lines.join(",")}: dynamic t() call is not pinned in scripts/i18n-dynamic-keys.json (list the keys it can produce)`);
}
for (const [file, entry] of pinned) {
  if (!dynamicByFile.has(file)) fail(`i18n-dynamic-keys.json: ${file} has no dynamic t() call any more, remove the entry`);
  if (!entry.keys?.length) fail(`i18n-dynamic-keys.json: ${file} lists no keys`);
  const sources = entry.sources ?? [file];
  for (const key of entry.keys ?? []) {
    used.add(key);
    if (!defined.has(key)) fail(`i18n-dynamic-keys.json: ${file}: "${key}" is not defined in any i18n module`);
    if (!sources.some((source) => literal(textOf.get(source) ?? "", key))) {
      fail(`i18n-dynamic-keys.json: ${file}: "${key}" is not mentioned in ${sources.join(", ")}, the list is stale`);
    }
  }
}

// Unused keys: no static call, keyed prop or other quoted literal in any consumer.
const unused = [...defined].filter((key) => !/^(err|opErr|joinErr)_/.test(key) && !used.has(key) && !consumers.some(({ text }) => literal(text, key))).sort();
for (const key of unused) (strict ? fail : warn)(`"${key}" is defined but never referenced`);

// err_<CODE> family against the gateway's code lists.
const codeSources = ["src/shared/errors.ts", "src/shared/messageCodes.ts"].map((path) => join(root, "..", path)).filter(existsSync);
const codes = new Set();
// The code catalog names its codes as bare object keys; the other sources quote them.
for (const path of codeSources) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/"([A-Z][A-Z0-9_]+)"/g)) codes.add(match[1]);
  for (const match of source.matchAll(/^ {2}([A-Z][A-Z0-9_]+): \{\} as /gm)) codes.add(match[1]);
}
const errKeys = [...defined].filter((key) => key.startsWith("err_"));
// Some codes only exist in a gateway file outside those two lists (join and close reasons) or are
// made by the browser itself (close-code mapping), so "has a matching code" looks wider than the
// required set above: any quoted code in the gateway sources or in the session feature's code lists.
const wideSources = [join(root, "..", "src"), join(root, "src", "features", "session")];
const wideCodes = new Set(codes);
function collectQuoted(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules") collectQuoted(full); continue; }
    if (!/\.ts$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) continue;
    for (const match of readFileSync(full, "utf8").matchAll(/"([A-Z][A-Z0-9_]+)"/g)) wideCodes.add(match[1]);
  }
}
for (const path of wideSources) if (existsSync(path)) collectQuoted(path);
for (const key of errKeys) {
  if (!wideCodes.has(key.slice(4))) fail(`"${key}" has no matching code in src/shared/errors.ts or messageCodes.ts`);
}
const withoutKey = [...codes].filter((code) => !defined.has(`err_${code}`)).sort();
if (withoutKey.length > 0) {
  const message = `${withoutKey.length} gateway code(s) have no err_<CODE> key yet: ${withoutKey.join(", ")}`;
  if (errKeys.length > 0 || strict) fail(message); else warn(`${message} (enforced once the err_ family exists, I3.1)`);
}

console.log(`${defined.size} keys defined, ${used.size} referenced, ${unused.length} unused, ${dynamicByFile.size} file(s) with dynamic t() calls, ${errKeys.length} err_ key(s), ${problems} problem(s)`);
if (problems > 0) {
  console.error("FAIL");
  process.exit(1);
}
console.log("OK: every used key is defined, every dynamic site is pinned");
