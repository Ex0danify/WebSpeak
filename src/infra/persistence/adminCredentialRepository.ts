import type { AdminCredential } from "../security/adminPassword.js";
import type { PersistenceContext } from "./persistenceContext.js";

export class AdminCredentialRepository {
  constructor(private readonly context: PersistenceContext) {}

  has(): boolean {
    return Boolean(this.context.database.prepare("SELECT 1 AS present FROM admin_credentials WHERE id = 1").get());
  }

  get(): AdminCredential | null {
    const row = this.context.database.prepare("SELECT credential_json FROM admin_credentials WHERE id = 1").get() as { credential_json?: string } | undefined;
    if (!row?.credential_json) return null;
    const credential = JSON.parse(row.credential_json) as Partial<AdminCredential>;
    return {
      ...credential,
      version: 1,
      username: typeof credential.username === "string" && credential.username ? credential.username : "admin",
      mustChangePassword: credential.mustChangePassword === true,
    } as AdminCredential;
  }

  insert(credential: AdminCredential, now: string): void {
    this.context.database.prepare(
      "INSERT INTO admin_credentials (id, credential_json, created_at, updated_at) VALUES (1, ?, ?, ?)",
    ).run(JSON.stringify(credential), now, now);
  }

  update(credential: AdminCredential): void {
    const now = new Date().toISOString();
    this.context.database.prepare(
      "UPDATE admin_credentials SET credential_json = ?, updated_at = ? WHERE id = 1",
    ).run(JSON.stringify(credential), now);
  }
}
