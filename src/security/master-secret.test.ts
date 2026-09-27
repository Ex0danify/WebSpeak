import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOrCreateMasterSecret } from "./master-secret.js";

const posix = process.platform !== "win32";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "webspeak-master-secret-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadOrCreateMasterSecret", () => {
  it("creates a 32 byte key on first use, including missing parent directories", () => {
    const path = join(dir, "nested", "deeper", "master.key");
    const key = loadOrCreateMasterSecret(path);
    expect(key).toHaveLength(32);
    expect(readFileSync(path).equals(key)).toBe(true);
  });

  it("returns the same key on every later call (create once, reload)", () => {
    const path = join(dir, "master.key");
    const first = loadOrCreateMasterSecret(path);
    const second = loadOrCreateMasterSecret(path);
    expect(second.equals(first)).toBe(true);
  });

  it("generates different keys for different installations", () => {
    const a = loadOrCreateMasterSecret(join(dir, "a.key"));
    const b = loadOrCreateMasterSecret(join(dir, "b.key"));
    expect(a.equals(b)).toBe(false);
  });

  it("never overwrites an existing key file", () => {
    const path = join(dir, "master.key");
    const existing = Buffer.alloc(32, 5);
    writeFileSync(path, existing);
    expect(loadOrCreateMasterSecret(path).equals(existing)).toBe(true);
    expect(readFileSync(path).equals(existing)).toBe(true);
  });

  it.skipIf(!posix)("creates the file with mode 0600", () => {
    const path = join(dir, "master.key");
    loadOrCreateMasterSecret(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it.skipIf(!posix)("tightens a loose mode on an existing key file", () => {
    const path = join(dir, "master.key");
    writeFileSync(path, Buffer.alloc(32, 5));
    chmodSync(path, 0o644);
    loadOrCreateMasterSecret(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it.each([0, 16, 31, 33, 64])("refuses an existing key file of %i bytes", (length) => {
    const path = join(dir, "master.key");
    writeFileSync(path, Buffer.alloc(length, 1));
    expect(() => loadOrCreateMasterSecret(path)).toThrow("expected 32 bytes");
    expect(readFileSync(path)).toHaveLength(length);
  });

  it("propagates errors other than 'already exists'", () => {
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "a file, not a directory");
    expect(() => loadOrCreateMasterSecret(join(blocker, "master.key"))).toThrow();
  });

  it("propagates the error when the path is a directory", () => {
    const path = join(dir, "is-a-dir");
    mkdirSync(path);
    expect(() => loadOrCreateMasterSecret(path)).toThrow();
  });
});
