// Stamps a finished web build with a fingerprint of its inputs, so a test run refuses to serve a stale bundle.
//
// CLI (run from web/ at the end of the build): node ../scripts/build-stamp.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const INPUTS = ["src", "public", "index.html", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json", "vite.config.ts"];

function* walk(path) {
  if (!existsSync(path)) return;
  if (!statSync(path).isDirectory()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path).sort()) yield* walk(join(path, entry));
}

/** Hash of every file that feeds the web build. Independent of git. */
export function computeWebFingerprint(webDir) {
  const hash = createHash("sha256");
  for (const input of INPUTS) {
    for (const file of walk(join(webDir, input))) {
      hash.update(relative(webDir, file).split(sep).join("/"));
      hash.update("\0");
      hash.update(readFileSync(file));
      hash.update("\0");
    }
  }
  return hash.digest("hex");
}

function git(webDir, ...args) {
  try {
    return execFileSync("git", args, { cwd: webDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** Writes web/dist/.build-stamp. Commit and dirty flag are informational (null without git). */
export function writeBuildStamp(webDir) {
  const status = git(webDir, "status", "--porcelain", "--", ".");
  const stamp = {
    commit: git(webDir, "rev-parse", "HEAD"),
    dirty: status === null ? null : status !== "",
    fingerprint: computeWebFingerprint(webDir),
    builtAt: new Date().toISOString(),
  };
  writeFileSync(join(webDir, "dist", ".build-stamp"), `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stamp = writeBuildStamp(process.cwd());
  console.log(`build stamp: ${stamp.fingerprint.slice(0, 12)} (${stamp.commit?.slice(0, 7) ?? "no git"}${stamp.dirty ? ", dirty" : ""})`);
}
