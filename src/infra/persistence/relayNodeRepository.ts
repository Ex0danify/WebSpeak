import type { RelayNodeRow } from "./databaseRows.js";
import type { PersistedRelayNode } from "./databaseTypes.js";
import type { PersistenceContext } from "./persistenceContext.js";

export class RelayNodeRepository {
  constructor(private readonly context: PersistenceContext) {}

  list(): PersistedRelayNode[] {
    const rows = this.context.database.prepare(
      "SELECT * FROM relay_nodes ORDER BY created_at ASC, id ASC",
    ).all() as RelayNodeRow[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      enabled: row.enabled === 1,
      host: row.host,
      port: row.port,
      tokenEncrypted: row.token_encrypted,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  replace(nodes: Array<Omit<PersistedRelayNode, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }>): void {
    const now = new Date().toISOString();
    this.context.transaction(() => {
      this.context.database.exec("DELETE FROM relay_nodes");
      const insert = this.context.database.prepare(
        `INSERT INTO relay_nodes (id, name, enabled, host, port, token_encrypted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const node of nodes) {
        insert.run(
          node.id,
          node.name,
          node.enabled ? 1 : 0,
          node.host,
          node.port,
          node.tokenEncrypted,
          node.createdAt ?? now,
          node.updatedAt ?? now,
        );
      }
    });
  }
}
