import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertFreshBuild } from "../e2e/helpers/build-stamp";
// @ts-expect-error untyped build script
import { writeBuildStamp } from "../scripts/build-stamp.mjs";

let web: string;

function put(path: string, content: string) {
  const full = join(web, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  web = mkdtempSync(join(tmpdir(), "build-stamp-"));
  put("index.html", "<html></html>");
  put("package.json", "{}");
  put("src/main.ts", "export {};");
  put("dist/index.html", "built");
});

afterEach(() => rmSync(web, { recursive: true, force: true }));

describe("assertFreshBuild", () => {
  it("refuses a build without a stamp", () => {
    expect(() => assertFreshBuild(web)).toThrow(/untrusted/);
  });

  it("accepts a build stamped from the current sources", () => {
    writeBuildStamp(web);
    expect(() => assertFreshBuild(web)).not.toThrow();
  });

  it("refuses a build after a source file changed", () => {
    writeBuildStamp(web);
    put("src/main.ts", "export const changed = 1;");
    expect(() => assertFreshBuild(web)).toThrow(/stale.*npm --prefix web run build/);
  });

  it("refuses a build after a source file was added", () => {
    writeBuildStamp(web);
    put("src/new.ts", "export {};");
    expect(() => assertFreshBuild(web)).toThrow(/stale/);
  });

  it("ignores output and dependencies, which are not build inputs", () => {
    writeBuildStamp(web);
    put("dist/extra.js", "x");
    put("node_modules/dep/index.js", "x");
    expect(() => assertFreshBuild(web)).not.toThrow();
  });
});
