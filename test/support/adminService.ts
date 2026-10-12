import { type Mock, vi } from "vitest";
import { AdminService, type AdminSettingsInput } from "../../src/modules/admin/adminService.js";
import type { Logger } from "../../src/shared/logger.js";
import { useDatabaseFixture } from "./database.js";

export const MASTER_SECRET = Buffer.alloc(32, 7);

/** What `WEBSPEAK_ADMIN_USERNAME` and `WEBSPEAK_ADMIN_PASSWORD` hold in the tests that start from a fresh database. */
/** The port the admin console shows in tests, nothing listens on it. */
export const TEST_PORT = 3040;

export const BOOTSTRAP = { username: "admin", password: "initial test password 1" };

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
    /** Opens the database and builds a service on it. `secret` defaults to the fixed test secret. */
    create(secret: Buffer = MASTER_SECRET): AdminService {
      const db = database.open();
      return new AdminService(db, secret, context.logger, TEST_PORT, context.probe as never, "9.9.9", context.ping as never);
    },
  };
  return context;
}
