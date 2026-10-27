import type { WebSpeakDatabase } from "../../infra/persistence/database.js";

const THROTTLE_MS = 60_000;

/** Events of the gateway itself for the event log. What can repeat is written once per minute, a flood must not fill the log. */
export class GatewayEvents {
  private readonly lastWritten = new Map<string, number>();

  constructor(
    private readonly database: WebSpeakDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  started(version: string): void {
    this.write("GATEWAY_STARTED", { version });
  }

  stopped(signal: string): void {
    this.write("GATEWAY_STOPPED", { signal });
  }

  error(source: "request" | "process", message: string): void {
    this.throttled(`error:${source}:${message}`, "GATEWAY_ERROR", { source, message: message.slice(0, 300) });
  }

  capacityReached(maxSessions: number): void {
    this.throttled("capacity", "CAPACITY_REACHED", { maxSessions });
  }

  private throttled(key: string, event: string, details: Record<string, unknown>): void {
    const now = this.now();
    const last = this.lastWritten.get(key);
    if (last !== undefined && now - last < THROTTLE_MS) return;
    this.lastWritten.set(key, now);
    // Distinct error texts are unbounded, only recent keys are worth remembering.
    if (this.lastWritten.size > 200) {
      for (const [entry, at] of this.lastWritten) if (now - at >= THROTTLE_MS) this.lastWritten.delete(entry);
    }
    this.write(event, details);
  }

  private write(event: string, details: Record<string, unknown>): void {
    try {
      this.database.addAudit(event, details);
    } catch {
      // The log of events must never take the gateway down, a closed database at shutdown is the usual case.
    }
  }
}
