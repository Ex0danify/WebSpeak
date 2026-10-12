import { validateAdminPassword } from "../../infra/security/adminPassword.js";

const USERNAME_PATTERN = /^[A-Za-z0-9._@-]{1,64}$/;

/** The account a fresh database starts with. The password must be changed at the first login. */
export interface AdminBootstrap {
  username: string;
  password: string;
}

export class AdminBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminBootstrapError";
  }
}

export function validateAdminUsername(username: string): string | null {
  return USERNAME_PATTERN.test(username) ? null : "Admin username must be 1 to 64 characters of letters, digits and . _ @ -";
}

/**
 * Checks the WEBSPEAK_ADMIN_* values. Without a password there is no bootstrap: the account would otherwise have
 * a default anyone knows, so a fresh install refuses to start instead.
 */
export function parseAdminBootstrap(raw: { username: string; password?: string }): AdminBootstrap | undefined {
  if (raw.password === undefined) return undefined;
  const username = raw.username;
  const usernameError = validateAdminUsername(username);
  if (usernameError) throw new AdminBootstrapError(`WEBSPEAK_ADMIN_USERNAME: ${usernameError}`);
  const passwordError = validateAdminPassword(raw.password);
  if (passwordError) throw new AdminBootstrapError(`WEBSPEAK_ADMIN_PASSWORD: ${passwordError}`);
  return { username, password: raw.password };
}
