// Compare two snapshot sets and print the percentage of changed pixels per shot.
//
//   npm run snapshot:diff [-- --a baseline --b after --threshold 0]
//
// Exits non-zero when any shot differs by more than --threshold percent
// (default 0, so any change fails) or when the two sets have different shots.
// Diff images are written to .snapshots/diff-<a>-<b>/.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const a = option("a", "baseline");
const b = option("b", "after");
const threshold = Number(option("threshold", "0"));
const dirA = join(root, ".snapshots", a);
const dirB = join(root, ".snapshots", b);
const diffDir = join(root, ".snapshots", `diff-${a}-${b}`);

for (const dir of [dirA, dirB]) {
  if (!existsSync(dir)) {
    console.error(`missing snapshot set: ${dir}`);
    process.exit(2);
  }
}

const list = (dir) => new Set(readdirSync(dir).filter((file) => file.endsWith(".png")));
const filesA = list(dirA);
const filesB = list(dirB);
rmSync(diffDir, { recursive: true, force: true });
mkdirSync(diffDir, { recursive: true });

let failed = false;
const rows = [];
for (const file of [...new Set([...filesA, ...filesB])].sort()) {
  if (!filesA.has(file) || !filesB.has(file)) {
    rows.push({ file, note: filesA.has(file) ? `only in ${a}` : `only in ${b}` });
    failed = true;
    continue;
  }
  const imageA = PNG.sync.read(readFileSync(join(dirA, file)));
  const imageB = PNG.sync.read(readFileSync(join(dirB, file)));
  if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
    rows.push({ file, note: `size ${imageA.width}x${imageA.height} -> ${imageB.width}x${imageB.height}` });
    failed = true;
    continue;
  }
  const diff = new PNG({ width: imageA.width, height: imageA.height });
  const changed = pixelmatch(imageA.data, imageB.data, diff.data, imageA.width, imageA.height, { threshold: 0.1 });
  const percent = (changed / (imageA.width * imageA.height)) * 100;
  if (changed > 0) writeFileSync(join(diffDir, file), PNG.sync.write(diff));
  if (percent > threshold) failed = true;
  rows.push({ file, percent });
}

for (const row of rows) {
  console.log(row.note ? `${row.file.padEnd(36)} ${row.note}` : `${row.file.padEnd(36)} ${row.percent.toFixed(2)}%`);
}
console.log(failed ? `FAIL: differences above ${threshold}% (diffs in ${diffDir})` : "OK: no differences above threshold");
process.exit(failed ? 1 : 0);
