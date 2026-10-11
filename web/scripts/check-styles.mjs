// Literal colors live only in src/shared/styles/tokens.css. Every other .vue, .css and .ts file
// under src/ (test files and test support excluded) is scanned, whole file, so <style> blocks,
// inline `style=`, SVG attributes and class strings are all covered. A hit is
//   colors          a hex, rgb()/rgba(), hsl()/hsla(), hwb(), oklch() or oklab() literal
//   themeSelectors  a `data-theme` reference (dark-mode override rules that the design tokens
//                   make unnecessary)
// There is no budget and no allowlist: a surface that needs a color no token expresses gets a token.
//
//   npm run check:styles
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// `(?<![\w&])` skips `host#39087` and `&#123;`; hex lengths 3, 4, 6 and 8 only.
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FUNCTIONAL = /\b(?:rgba?|hsla?|hwb|oklch|oklab)\(/g;
const THEME = /data-theme/g;

const EXTENSIONS = [".vue", ".css", ".ts"];

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "testSupport") files.push(...sourceFiles(path));
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext)) && !entry.endsWith(".test.ts") && entry !== "tokens.css") {
      files.push(path);
    }
  }
  return files;
}

const problems = [];
for (const path of sourceFiles(join(root, "src")).sort()) {
  const source = readFileSync(path, "utf8");
  const colors = (source.match(HEX) ?? []).length + (source.match(FUNCTIONAL) ?? []).length;
  const themeSelectors = (source.match(THEME) ?? []).length;
  const file = relative(root, path).split("\\").join("/");
  if (colors) problems.push(`${file}: ${colors} literal color(s) (add a token to tokens.css)`);
  if (themeSelectors) problems.push(`${file}: ${themeSelectors} data-theme reference(s)`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("FAIL: style check");
  process.exit(1);
}
console.log("OK: no literal color or data-theme selector outside tokens.css");
