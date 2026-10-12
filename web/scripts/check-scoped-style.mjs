// Components carry no <style> block, styling is Tailwind utilities and tokens and anything a utility cannot say lives in
// src/shared/styles/main.css. Any <style> block in any .vue file under src/ (shared/ui included) fails. There is no budget.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function vueFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...vueFiles(path));
    else if (entry.endsWith(".vue")) files.push(path);
  }
  return files;
}

const problems = [];
for (const path of vueFiles(join(root, "src")).sort()) {
  if (/<style\b/.test(readFileSync(path, "utf8"))) problems.push(`${relative(root, path).split("\\").join("/")}: has a <style> block`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("FAIL: scoped style check (move the rule to utilities, a cva file or shared/styles/main.css)");
  process.exit(1);
}
console.log("OK: no <style> block in any component");
