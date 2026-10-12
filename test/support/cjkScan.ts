import { DatabaseSync } from "node:sqlite";

const CJK = /[\u2e80-\u2fdf\u3000-\u303f\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/u;

export interface CjkCell {
  table: string;
  column: string;
  rowid: number;
  value: string;
}

/** Every text cell of every table (the SQLite internals excluded) that holds a CJK character. */
export function findCjkCells(file: string): CjkCell[] {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    const found: CjkCell[] = [];
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;
    for (const { name } of tables) {
      const columns = raw.prepare(`PRAGMA table_info("${name}")`).all() as Array<{ name: string }>;
      const rows = raw.prepare(`SELECT rowid AS rowid_, * FROM "${name}"`).all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        for (const column of columns) {
          const value = row[column.name];
          if (typeof value === "string" && CJK.test(value))
            found.push({ table: name, column: column.name, rowid: Number(row.rowid_), value });
        }
      }
    }
    return found;
  } finally {
    raw.close();
  }
}
