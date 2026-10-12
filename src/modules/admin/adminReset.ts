import type { WebSpeakDatabase } from "../../infra/persistence/database.js";
import { hashAdminPassword, validateAdminPassword } from "../../infra/security/adminPassword.js";
import { AdminBootstrapError, validateAdminUsername } from "./adminBootstrap.js";

/**
 * Sets a new password for the administrator account, and optionally a new username. The password must be changed
 * again at the next login and every session of the account ends. This is the recovery path for a lost password.
 */
export async function resetAdminAccount(
  database: WebSpeakDatabase,
  input: { password: string; username?: string },
): Promise<{ username: string }> {
  const existing = database.getAdminCredential();
  if (!existing)
    throw new AdminBootstrapError("There is no administrator account to reset. Start WebSpeak once with WEBSPEAK_ADMIN_PASSWORD set.");
  const passwordError = validateAdminPassword(input.password);
  if (passwordError) throw new AdminBootstrapError(passwordError);
  const username = input.username ?? existing.username;
  const usernameError = validateAdminUsername(username);
  if (usernameError) throw new AdminBootstrapError(usernameError);
  database.resetAdminCredential(await hashAdminPassword(input.password, { username, mustChangePassword: true }));
  return { username };
}
