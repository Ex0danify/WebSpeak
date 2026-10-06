import type { PersistenceContext } from "./persistenceContext.js";

export class MetaRepository {
  constructor(private readonly context: PersistenceContext) {}

  get(key: string): string | null {
    const row = this.context.database.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.context.database.prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value);
  }

  nextVisitorNumber(): number {
    let nextNumber = 1;
    this.context.transaction(() => {
      const currentValue = this.get("visitor_count");
      const current = currentValue ? Number.parseInt(currentValue, 10) : 0;
      nextNumber = Number.isSafeInteger(current) && current >= 0 && current < Number.MAX_SAFE_INTEGER
        ? current + 1
        : 1;
      this.set("visitor_count", String(nextNumber));
    });
    return nextNumber;
  }

  getVisitorCount(): number {
    const value = this.get("visitor_count");
    const count = value ? Number.parseInt(value, 10) : 0;
    return Number.isSafeInteger(count) && count >= 0 ? count : 0;
  }
}
