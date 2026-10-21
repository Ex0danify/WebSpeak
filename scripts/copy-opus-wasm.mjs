// tsc emits only .ts; the Opus WASM glue and binary are copied into dist beside the compiled loader.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "src", "lib", "opus");
const to = join(root, "dist", "lib", "opus");

mkdirSync(to, { recursive: true });
for (const file of ["opusGlue.mjs", "opus.wasm"]) copyFileSync(join(from, file), join(to, file));
console.log("copy-opus-wasm: copied opusGlue.mjs + opus.wasm to dist/lib/opus");
