import path from "node:path";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAccelerationRelayServer } from "./modules/relay/index.js";
import { normalizeScreenShareIceServers, type ScreenShareIceServer } from "./modules/screenShare/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");
const CERT_DIR = path.join(ROOT_DIR, "certs");
// Production images mount the data volume at /data, source installs use ./data unless overridden.
const DATA_DIR = process.env.WEBSPEAK_DATA_DIR?.trim() || path.join(ROOT_DIR, "data");
const LOG_DIR = path.join(DATA_DIR, "logs");
const STATIC_DIR = path.join(ROOT_DIR, "web", "dist");
const APP_VERSION = readPackageVersion();
const SHUTDOWN_TIMEOUT_MS = 10_000;
const SCREEN_SHARE_ICE_SERVERS = readScreenShareIceServers(process.env.WEBSPEAK_SCREEN_SHARE_ICE_SERVERS);

async function main() {
  if (process.env.WEBSPEAK_MODE?.trim().toLowerCase() === "relay") {
    await runRelayMode();
    return;
  }
  const [
    { createLogger },
    { createWebServer },
    { APP_PORT },
    { WebSpeakDatabase },
    { loadOrCreateMasterSecret },
    { AdminService },
    { JoinTicketStore },
  ] = await Promise.all([
    import("./shared/logger.js"),
    import("./transport/http/httpServer.js"),
    import("./shared/constants.js"),
    import("./infra/persistence/database.js"),
    import("./infra/security/masterSecret.js"),
    import("./modules/admin/index.js"),
    import("./modules/join/index.js"),
  ]);
  const logger = createLogger(LOG_DIR);
  const database = new WebSpeakDatabase(path.join(DATA_DIR, "webspeak.db"));
  const pruned = database.pruneAudit();
  const masterSecret = loadOrCreateMasterSecret(path.join(DATA_DIR, "master.key"));
  const adminService = new AdminService(database, masterSecret, logger, CONFIG_PATH, undefined, APP_VERSION);
  await adminService.initialize();
  removeObsoleteBootstrapFile();
  const joinTickets = new JoinTicketStore();

  logger.info({ dataDir: DATA_DIR }, "Starting WebSpeak server");
  if (pruned > 0) logger.info({ pruned }, "Trimmed the audit log");
  // One stray rejection must not take every live session down. A thrown exception still crashes on purpose.
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, "Unhandled promise rejection");
  });

  const hasCert = existsSync(path.join(CERT_DIR, "cert.pem"));

  const webServer = createWebServer({
    port: APP_PORT,
    version: APP_VERSION,
    logFile: path.join(LOG_DIR, "webspeak.log"),
    staticDir: STATIC_DIR,
    certDir: hasCert ? CERT_DIR : undefined,
    voiceBridgeOptions: {
      joinTickets,
      webRtc: () => adminService.getWebRtcAudioOptions(),
      screenShareIceServers: () => SCREEN_SHARE_ICE_SERVERS,
      // The public gateway only uses the relay config saved in the admin console. Env vars are for the
      // standalone relay process and must not bring the relay option back after an admin disabled it.
      acceleration: () => adminService.getAccelerationRelayOptions(),
      accelerationName: () => adminService.getAccelerationRelayName(),
    },
    adminService,
    logger,
    nextVisitorNumber: () => database.nextVisitorNumber(),
    visitorCount: () => database.getVisitorCount(),
  });

  await webServer.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    // A stuck close must not keep the process alive until the supervisor's SIGKILL.
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
    });
    let exitCode = 0;
    try {
      await Promise.race([webServer.stop(), deadline]);
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error) }, "Shutdown failed");
      exitCode = 1;
    } finally {
      clearTimeout(timer);
    }
    database.close();
    process.exit(exitCode);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

async function runRelayMode(): Promise<void> {
  const token = (process.env.WEBSPEAK_RELAY_TOKEN || process.env.WEBSPEAK_ACCELERATION_RELAY_TOKEN)?.trim();
  if (!token) throw new Error("WEBSPEAK_RELAY_TOKEN is required in relay mode");
  const host = (process.env.WEBSPEAK_RELAY_HOST || process.env.WEBSPEAK_ACCELERATION_RELAY_HOST)?.trim() || "0.0.0.0";
  const port = parsePort(process.env.WEBSPEAK_RELAY_PORT || process.env.WEBSPEAK_ACCELERATION_RELAY_PORT, 39087);
  const allowPrivate = parseBoolean(process.env.WEBSPEAK_RELAY_ALLOW_PRIVATE || process.env.WEBSPEAK_ACCELERATION_RELAY_ALLOW_PRIVATE);
  const server = await createAccelerationRelayServer({ host, port, token, allowPrivate });
  console.log(`WebSpeak relay mode listening on ${server.host}:${server.port}`);
  const shutdown = (): void => {
    server.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")) as { version?: unknown };
    return typeof packageJson.version === "string" && packageJson.version ? packageJson.version : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function removeObsoleteBootstrapFile(): void {
  try {
    unlinkSync(path.join(DATA_DIR, "bootstrap"));
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

function parsePort(value: string | undefined, fallback: number): number {
  const port = value ? Number(value) : fallback;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid relay port");
  return port;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function readScreenShareIceServers(value: string | undefined): ScreenShareIceServer[] {
  const raw = value?.trim();
  if (!raw) return normalizeScreenShareIceServers();
  try {
    const parsed: unknown = JSON.parse(raw);
    return normalizeScreenShareIceServers(Array.isArray(parsed) ? parsed : undefined);
  } catch {
    // A simple comma/space-separated list is convenient for STUN-only setups.
    return normalizeScreenShareIceServers(
      raw
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((urls) => ({ urls })),
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
