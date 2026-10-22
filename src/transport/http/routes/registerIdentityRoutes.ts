import express from "express";
import { IDENTITY_MINT_LEVEL_MIN } from "../../../config/identityMintConfig.js";
import type { IdentityMintQueue } from "../../../modules/identity/index.js";
import { QueueFullError } from "../../../modules/identity/index.js";
import type { JoinRateLimiter } from "../../../modules/join/index.js";
import { identityFromString } from "../../../modules/teamspeak/index.js";
import { clientRateLimitKey } from "../../../shared/http/clientIp.js";
import { isSameOrigin } from "../../../shared/http/sameOrigin.js";
import { isRecord } from "../../../shared/typeGuards.js";
import type { WebServerOptions } from "../webServerOptions.js";

// Matches the web client baseline so a freshly minted identity needs no later upgrade to connect.
const DEFAULT_MINT_LEVEL = 8;
const MINT_BUSY_RETRY_SECONDS = 5;
const MAX_IDENTITY_LENGTH = 8192;

/** Mint (`POST /api/identity`) and validate (`POST /api/identity/validate`) a device identity. */
export function registerIdentityRoutes(
  app: express.Express,
  options: WebServerOptions,
  rateLimiter: JoinRateLimiter,
  queue: IdentityMintQueue,
): void {
  /** Shared gate: same-origin JSON, gateway set up, peer under its rate limit. */
  const admit = (request: express.Request, response: express.Response): boolean => {
    response.setHeader("Cache-Control", "no-store");
    if (!request.is("application/json") || !isSameOrigin(request)) {
      response.status(403).json({ ok: false, code: "ORIGIN_REJECTED" });
      return false;
    }
    if (!options.adminService.isInitialized()) {
      response.status(503).json({ ok: false, code: "NOT_INITIALIZED" });
      return false;
    }
    if (!rateLimiter.allow(clientRateLimitKey(request))) {
      response.status(429).json({ ok: false, code: "RATE_LIMITED" });
      return false;
    }
    return true;
  };

  app.post("/api/identity", async (request, response) => {
    if (!admit(request, response)) return;

    const policy = options.adminService.getIdentityMintPolicy();
    const body = isRecord(request.body) ? request.body : {};
    const explicit = typeof body.level === "number" && Number.isInteger(body.level);
    const level = explicit ? (body.level as number) : Math.min(DEFAULT_MINT_LEVEL, policy.maxLevel);
    if (explicit && (body.level as number) < IDENTITY_MINT_LEVEL_MIN) {
      response.status(400).json({ ok: false, code: "INVALID_LEVEL" });
      return;
    }
    if (level > policy.maxLevel) {
      response.status(400).json({ ok: false, code: "LEVEL_TOO_HIGH" });
      return;
    }
    // The depth check runs before the stream commits so a full line still answers with a 429.
    if (!queue.hasCapacity()) {
      response.setHeader("Retry-After", String(MINT_BUSY_RETRY_SECONDS));
      response.status(429).json({ ok: false, code: "MINT_BUSY" });
      return;
    }

    const controller = new AbortController();
    // Fires when the connection drops; `writableEnded` tells a real disconnect from our own end().
    response.on("close", () => {
      if (!response.writableEnded) controller.abort(new Error("client disconnected"));
    });
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    const send = (event: string, data: unknown): void => {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const identity = await queue.submit(level, {
        signal: controller.signal,
        onPosition: (ahead) => send("position", { ahead }),
        onStart: () => send("minting", { level }),
      });
      send("identity", { identity: identity.toString(), level: identity.securityLevel() });
    } catch (error) {
      if (controller.signal.aborted) {
        response.end();
        return;
      }
      // Headers are already out, so over-depth here can only surface as a stream error event.
      send("error", { code: error instanceof QueueFullError ? "MINT_BUSY" : "MINT_FAILED" });
    }
    response.end();
  });

  app.post("/api/identity/validate", (request, response) => {
    if (!admit(request, response)) return;
    const body = isRecord(request.body) ? request.body : {};
    const text = typeof body.identity === "string" && body.identity.length <= MAX_IDENTITY_LENGTH ? body.identity : "";
    try {
      const identity = identityFromString(text);
      response.status(200).json({ ok: true, level: identity.securityLevel() });
    } catch {
      response.status(400).json({ ok: false, code: "INVALID_IDENTITY" });
    }
  });
}
