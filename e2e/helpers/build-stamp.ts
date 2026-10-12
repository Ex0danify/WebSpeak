import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error untyped build script
import { computeWebFingerprint } from "../../scripts/build-stamp.mjs";

const defaultWebDir = fileURLToPath(new URL("../../web", import.meta.url));

/**
 * Throws when web/dist was not built from the current web sources. Every layer that serves the frontend calls this first.
 */
export function assertFreshBuild(webDir: string = defaultWebDir): void {
  const stampPath = join(webDir, "dist", ".build-stamp");
  if (!existsSync(stampPath)) {
    throw new Error("web/dist has no .build-stamp, so the build is untrusted. Run: npm --prefix web run build");
  }
  const stamp = JSON.parse(readFileSync(stampPath, "utf8")) as { fingerprint?: string; builtAt?: string };
  if (stamp.fingerprint !== computeWebFingerprint(webDir)) {
    throw new Error(
      `web/dist is stale (built ${stamp.builtAt ?? "at an unknown time"}, sources changed since). Run: npm --prefix web run build`,
    );
  }
}
