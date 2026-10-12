import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import { isHttpsRequest } from "../../shared/http/clientIp.js";

const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/** SHA-256 source expressions for the inline scripts of the built page (theme and language before first paint). */
export function inlineScriptHashes(staticDir: string | undefined): string[] {
  if (!staticDir) return [];
  let html: string;
  try {
    html = readFileSync(path.join(staticDir, "index.html"), "utf-8");
  } catch {
    return [];
  }
  return [...html.matchAll(INLINE_SCRIPT)].map(
    (match) =>
      `'sha256-${createHash("sha256")
        .update(match[1] ?? "")
        .digest("base64")}'`,
  );
}

/**
 * Content-Security-Policy for the app. Styles keep `unsafe-inline` because Vue writes style attributes, scripts
 * never do. `wasm-unsafe-eval` is for the RNNoise module, `blob:` for the microphone test recording, `data:` for
 * avatars.
 */
export function buildContentSecurityPolicy(scriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${scriptHashes.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(staticDir: string | undefined): RequestHandler {
  const csp = buildContentSecurityPolicy(inlineScriptHashes(staticDir));
  return (request, response, next) => {
    response.setHeader("Content-Security-Policy", csp);
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    // Only over HTTPS: a browser that sees the header on plain HTTP ignores it, but a proxy may cache it.
    if (isHttpsRequest(request)) response.setHeader("Strict-Transport-Security", "max-age=15552000");
    next();
  };
}
