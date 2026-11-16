interface Entry<T> {
  value: T;
  bytes: number;
  expiresAt: number;
}

/** A cache that holds at most `budget()` bytes and drops the least recently used entries first. The budget is read on every write so a changed setting applies at once. */
export class PreviewCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private used = 0;

  constructor(
    private readonly budget: () => number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.delete(key);
      return undefined;
    }
    // Reinserting moves it to the end of the map, which is the most recently used end.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** An entry larger than the whole budget is not kept. */
  set(key: string, value: T, bytes: number, ttlMs: number): void {
    this.delete(key);
    const budget = this.budget();
    if (bytes > budget) return;
    this.entries.set(key, { value, bytes, expiresAt: this.now() + ttlMs });
    this.used += bytes;
    for (const [oldest] of this.entries) {
      if (this.used <= budget) break;
      this.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get usedBytes(): number {
    return this.used;
  }

  private delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.used -= entry.bytes;
    this.entries.delete(key);
  }
}
