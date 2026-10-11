// Report: how many .vue files outside shared/ui and the gallery use each library component.
// Not a gate. Used by the consistency sweep to find components nobody uses and files that
// do without them.
//
//   npm run check:ui-usage
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

const all = vueFiles(join(root, "src")).map((path) => ({ file: relative(root, path).split("\\").join("/"), source: readFileSync(path, "utf8") }));
const library = all.filter(({ file }) => file.startsWith("src/shared/ui/") && !file.startsWith("src/shared/ui/shared/"));
const consumers = all.filter(({ file }) => !file.startsWith("src/shared/ui/") && file !== "src/views/UiGallery.vue");

const rows = library
  .map(({ file }) => file.split("/").pop().replace(".vue", ""))
  .sort()
  .map((name) => {
    const re = new RegExp(`<${name}[\\s/>]`);
    const users = consumers.filter(({ source }) => re.test(source));
    return { name, files: users.length, uses: users.reduce((sum, { source }) => sum + (source.match(new RegExp(`<${name}[\\s/>]`, "g")) ?? []).length, 0) };
  });

const width = Math.max(...rows.map((row) => row.name.length));
for (const row of rows) console.log(`${row.name.padEnd(width)}  files ${String(row.files).padStart(3)}  uses ${String(row.uses).padStart(3)}${row.files === 0 ? "  (unused outside the gallery)" : ""}`);
