import type { ServerRow } from "./databaseRows.js";
import type { PersistedServer } from "./databaseTypes.js";
import type { PersistenceContext } from "./persistenceContext.js";

export class ServerRepository {
  constructor(private readonly context: PersistenceContext) {}

  list(): PersistedServer[] {
    const rows = this.context.database
      .prepare("SELECT * FROM ts_servers ORDER BY position ASC, created_at ASC, id ASC")
      .all() as ServerRow[];
    return rows.map(mapServerRow);
  }

  get(id: string): PersistedServer | null {
    const row = this.context.database.prepare("SELECT * FROM ts_servers WHERE id = ?").get(id) as ServerRow | undefined;
    return row ? mapServerRow(row) : null;
  }

  insert(server: Pick<PersistedServer, "id" | "name" | "host" | "port" | "passwordEncrypted">, now: string): void {
    this.context.database
      .prepare(
        `INSERT INTO ts_servers (id, name, host, port, password_encrypted, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM ts_servers), ?, ?)`,
      )
      .run(server.id, server.name, server.host, server.port, server.passwordEncrypted, now, now);
  }

  /** A changed address makes the stored test result meaningless, so it is cleared with the edit. */
  update(server: Pick<PersistedServer, "id" | "name" | "host" | "port" | "passwordEncrypted">, now: string, clearTest: boolean): void {
    this.context.database
      .prepare(
        `UPDATE ts_servers SET name = ?, host = ?, port = ?, password_encrypted = ?, updated_at = ?${
          clearTest ? ", last_test_at = NULL, last_test_latency_ms = NULL, last_test_error = NULL" : ""
        } WHERE id = ?`,
      )
      .run(server.name, server.host, server.port, server.passwordEncrypted, now, server.id);
  }

  delete(id: string): boolean {
    const result = this.context.database.prepare("DELETE FROM ts_servers WHERE id = ?").run(id) as { changes?: number | bigint };
    return Number(result.changes ?? 0) === 1;
  }

  recordTest(id: string, result: { latencyMs: number | null; error: string | null }): void {
    this.context.database
      .prepare("UPDATE ts_servers SET last_test_at = ?, last_test_latency_ms = ?, last_test_error = ? WHERE id = ?")
      .run(new Date().toISOString(), result.latencyMs, result.error, id);
  }
}

function mapServerRow(row: ServerRow): PersistedServer {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    passwordEncrypted: row.password_encrypted,
    lastTestAt: row.last_test_at,
    lastTestLatencyMs: row.last_test_latency_ms,
    lastTestError: row.last_test_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
