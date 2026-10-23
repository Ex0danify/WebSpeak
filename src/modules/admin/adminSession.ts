import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "webspeak_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface AdminSession {
  csrfToken: string;
  expiresAt: number;
  epoch: string;
}

export class AdminSessionStore {
  private readonly sessions = new Map<string, AdminSession>();

  /** `epoch` names the account state a session belongs to: when it changes, older sessions stop working. */
  constructor(private readonly epoch: () => string = () => "") {}

  create(response: Response, secure: boolean, now = Date.now()): { csrfToken: string; expiresAt: number } {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const expiresAt = now + SESSION_TTL_MS;
    // A session nobody asks for again would otherwise stay in memory until the process ends.
    for (const [key, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(key);
    this.sessions.set(hashToken(token), { csrfToken, expiresAt, epoch: this.epoch() });
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "strict",
      secure,
      path: "/",
      maxAge: SESSION_TTL_MS,
    });
    return { csrfToken, expiresAt };
  }

  get(request: Request, now = Date.now()): AdminSession | null {
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    if (!token) return null;
    const key = hashToken(token);
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= now || session.epoch !== this.epoch()) {
      this.sessions.delete(key);
      return null;
    }
    return session;
  }

  destroy(request: Request, response: Response, secure: boolean): void {
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    if (token) this.sessions.delete(hashToken(token));
    response.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict", secure, path: "/" });
  }

  /** Drop every session but the caller's, so a password change signs out any other open admin session. */
  retainOnly(request: Request): void {
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    const keep = token ? hashToken(token) : undefined;
    for (const key of this.sessions.keys()) if (key !== keep) this.sessions.delete(key);
  }

  clear(): void {
    this.sessions.clear();
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
