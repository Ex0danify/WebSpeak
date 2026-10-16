// Import style check for web/src. Every module is imported through the `@/` alias, never as `./x` or `../x`, so all paths read the
// same, are searchable from the project root, and a file can move without its own imports being rewritten. Covers `from`,
// `import()`, side-effect imports and the `vi.mock`-style calls. A path that leaves src/ (a script or JSON in the repo) cannot use
// the alias and is left alone. `--fix` rewrites the offenders in place.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const fix = process.argv.includes("--fix");

const SOURCE = /\.(?:vue|[cm]?[jt]s)$/;
const PARENT_IMPORT =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\b(?:mock|doMock|unmock|importActual|importMock)\s*\(\s*)(["'])(\.{1,2}\/[^"']*|\.\.)\2/g;

const offenders = [];
let fixed = 0;

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (SOURCE.test(entry.name)) yield full;
  }
}

/** The `@/` form of a parent-relative specifier, or null when it points outside src/. */
function aliased(file, specifier) {
  const rel = relative(srcDir, resolve(dirname(file), specifier));
  return rel.startsWith("..") ? null : `@/${rel.split(sep).join("/")}`;
}

for (const file of sourceFiles(srcDir)) {
  const text = readFileSync(file, "utf8");
  const next = text.replace(PARENT_IMPORT, (match, lead, quote, specifier) => {
    const target = aliased(file, specifier);
    if (!target) return match;
    if (!fix) {
      const line = text.slice(0, text.indexOf(match)).split("\n").length;
      offenders.push(`${relative(root, file).split(sep).join("/")}:${line}: "${specifier}" should be "${target}"`);
    }
    fixed += 1;
    return `${lead}${quote}${target}${quote}`;
  });
  if (fix && next !== text) writeFileSync(file, next);
}

if (fix) {
  console.log(`check:imports --fix: rewrote ${fixed} import(s)`);
} else if (offenders.length) {
  console.error(`check:imports: ${offenders.length} relative import(s), use the @/ alias (npm run check:imports -- --fix rewrites them)`);
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
} else {
  console.log("OK: every import in src goes through the @/ alias");
}
