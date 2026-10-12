import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, inlineScriptHashes, securityHeaders } from "./securityHeaders.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function pageWith(html: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "csp-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

const hash = (source: string) => `'sha256-${createHash("sha256").update(source).digest("base64")}'`;

describe("inlineScriptHashes", () => {
  it("hashes inline scripts only, not the ones with a src", () => {
    const dir = pageWith(`<script>var a=1;</script><script type="module" crossorigin src="/a.js"></script><script>var b=2;</script>`);
    expect(inlineScriptHashes(dir)).toEqual([hash("var a=1;"), hash("var b=2;")]);
  });

  it("is empty without a page", () => {
    expect(inlineScriptHashes(undefined)).toEqual([]);
    expect(inlineScriptHashes("/nonexistent-dir")).toEqual([]);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("allows no remote origin, no framing and no plugins", () => {
    const csp = buildContentSecurityPolicy(["'sha256-x'"]);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' 'sha256-x'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/https?:|\*/);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});

describe("securityHeaders", () => {
  function run(encrypted: boolean) {
    const headers = new Map<string, string>();
    const request = { headers: {}, socket: { encrypted } } as unknown as IncomingMessage;
    const response = { setHeader: (name: string, value: string) => headers.set(name, value) } as unknown as ServerResponse;
    let called = false;
    securityHeaders(undefined)(request as never, response as never, () => (called = true));
    return { headers, called };
  }

  it("sets the headers and continues, with HSTS only over HTTPS", () => {
    const plain = run(false);
    expect(plain.called).toBe(true);
    expect(plain.headers.get("X-Frame-Options")).toBe("DENY");
    expect(plain.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(plain.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(plain.headers.has("Strict-Transport-Security")).toBe(false);
    expect(run(true).headers.has("Strict-Transport-Security")).toBe(true);
  });
});
