import express from "express";
import type { Logger } from "../../../shared/logger.js";
import type { WebServerOptions } from "../webServerOptions.js";
import { resolveAccelerationOptions } from "./accelerationOptions.js";

const VISITOR_NUMBER_COOKIE = "webspeak_visitor_number";

/** The unauthenticated read-only routes: `/health`, `/api/health`, `/api/public-config`. */
export function registerPublicRoutes(app: express.Express, options: WebServerOptions, logger: Logger): void {
  const healthHandler: express.RequestHandler = (_request, response) => {
    response.json({ status: "ok", version: options.version ?? "0.1.0" });
  };
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  app.get("/api/public-config", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const acceleration = resolveAccelerationOptions(options.voiceBridgeOptions.acceleration);
    let visitorNumber = readVisitorNumberCookie(request.header("cookie"));
    if (visitorNumber === null && options.nextVisitorNumber) {
      try {
        visitorNumber = options.nextVisitorNumber();
        response.setHeader(
          "Set-Cookie",
          `${VISITOR_NUMBER_COOKIE}=${visitorNumber}; Max-Age=31536000; Path=/; SameSite=Lax${options.certDir ? "; Secure" : ""}`,
        );
      } catch (error: unknown) {
        logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Visitor number could not be assigned");
      }
    }
    let visitorTotal: number | null = null;
    if (options.visitorCount) {
      try {
        const count = options.visitorCount();
        if (Number.isSafeInteger(count) && count >= 0) visitorTotal = count;
      } catch (error: unknown) {
        logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Visitor total could not be read");
      }
    } else if (visitorNumber !== null) {
      visitorTotal = visitorNumber;
    }
    response.json({
      ...options.adminService.getPublicConfig(),
      ...(visitorNumber === null ? {} : { visitorNumber }),
      ...(visitorTotal === null ? {} : { visitorTotal }),
      accelerationAvailable: acceleration.length > 0,
      accelerationRelays: acceleration.map((relay) => ({ id: relay.id, name: relay.name })),
    });
  });
}

function readVisitorNumberCookie(header: string | undefined): number | null {
  if (!header) return null;
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    if (name !== VISITOR_NUMBER_COOKIE) continue;
    const rawValue = entry.slice(separator + 1).trim();
    const number = Number.parseInt(rawValue, 10);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }
  return null;
}
