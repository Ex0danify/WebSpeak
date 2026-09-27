import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Mock, vi } from "vitest";
import { AdminService, type AdminSettingsInput } from "../../src/admin/admin-service.js";
import type { Logger } from "../../src/logger.js";
import { useDatabaseFixture } from "./database.js";

export const MASTER_SECRET = Buffer.alloc(32, 7);

export type StubLogger = Logger & Record<"debug" | "info" | "warn" | "error", Mock>;

export function stubLogger(): StubLogger {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
  logger.child.mockReturnValue(logger);
  return logger as unknown as StubLogger;
}

/** A settings form as the admin console sends it: valid, and different from the defaults. */
export function settingsInput(overrides: Partial<AdminSettingsInput> = {}): AdminSettingsInput {
  return {
    target: "ts.example.org:9988",
    accessMode: "open",
    siteName: "Test site",
    welcomeText: "welcome",
    webRtcEnabled: false,
    ...overrides,
  };
}

/** An `AdminService` on a temporary database with a fixed master secret, a stub probe and a stub host ping. */
export function useAdminService() {
  const database = useDatabaseFixture();
  const context = {
    database,
    logger: stubLogger(),
    probe: vi.fn(),
    ping: vi.fn(),
    legacyConfigPath: () => join(database.dir, "config.json"),
    writeLegacyConfig(config: unknown): void {
      database.open(); // makes sure the directory exists
      writeFileSync(context.legacyConfigPath(), JSON.stringify(config));
    },
    /** Opens the database and builds a service on it. `secret` defaults to the fixed test secret. */
    create(secret: Buffer = MASTER_SECRET): AdminService {
      const db = database.open();
      return new AdminService(db, secret, context.logger, context.legacyConfigPath(), context.probe as never, "9.9.9", context.ping as never);
    },
  };
  return context;
}
