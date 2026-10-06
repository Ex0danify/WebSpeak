import type { NextFunction, Request, Response } from "express";
import { AdminInputError, type AdminService } from "./adminService.js";
import type { AdminSessionStore } from "./adminSession.js";

export function requireAdmin(sessions: AdminSessionStore, service: AdminService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!sessions.get(request)) {
      response.status(401).json({ ok: false, code: "AUTH_REQUIRED" });
      return;
    }
    if (service.isPasswordChangeRequired()) {
      response.status(403).json({ ok: false, code: "PASSWORD_CHANGE_REQUIRED" });
      return;
    }
    next();
  };
}

export function requireCsrf(sessions: AdminSessionStore) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const session = sessions.get(request);
    const csrf = request.header("x-csrf-token");
    if (!session || !csrf || csrf !== session.csrfToken) {
      response.status(403).json({ ok: false, code: "CSRF_REJECTED" });
      return;
    }
    next();
  };
}

export function requireSameOrigin(request: Request, response: Response, next: NextFunction): void {
  if (!request.is("application/json")) {
    response.status(415).json({ ok: false, code: "JSON_REQUIRED" });
    return;
  }
  const origin = request.header("origin");
  const host = request.header("host");
  try {
    if (!origin || !host || new URL(origin).host !== host) throw new Error("origin mismatch");
  } catch {
    response.status(403).json({ ok: false, code: "ORIGIN_REJECTED" });
    return;
  }
  next();
}

export function sendAdminError(response: Response, error: unknown): void {
  if (error instanceof AdminInputError) {
    response.status(400).json({ ok: false, code: error.code });
    return;
  }
  response.status(500).json({ ok: false, code: "INTERNAL_ERROR" });
}
