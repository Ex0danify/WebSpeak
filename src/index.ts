import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EnvError, type GatewayEnv, loadEnvFile, readDataDir, readGatewayEnv, readMode, readRelayEnv } from "./config/env.js";
import { ADMIN_RESET_COMMAND, runAdminResetCommand } from "./transport/cli/adminResetCommand.js";
import { createAccelerationRelayServer } from "./modules/relay/index.js";
import { AdminBootstrapError } from "./modules/admin/index.js";
import { normalizeScreenShareIceServers, type ScreenShareIceServer } from "./modules/screenShare/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const CERT_DIR = path.join(ROOT_DIR, "certs");
const STATIC_DIR = path.join(ROOT_DIR, "web", "dist");
const APP_VERSION = readPackageVersion();
const SHUTDOWN_TIMEOUT_MS = 10_000;
const INVITE_SWEEP_MS = 24 * 60 * 60 * 1000;

async function main() {
  // A .env next to package.json, see .env.example. Variables from the real environment win over it.
  loadEnvFile(path.join(ROOT_DIR, ".env"));
  if (process.argv[2] === ADMIN_RESET_COMMAND) {
    process.exitCode = await runAdminResetCommand(process.argv.slice(3), path.resolve(ROOT_DIR, readDataDir()));
    return;
  }
  if (readMode() === "relay") {
    await runRelayMode();
    return;
  }
  await runGateway(readGatewayEnv());
}

async function runGateway(env: GatewayEnv): Promise<void> {
  const dataDir = path.resolve(ROOT_DIR, env.dataDir);
  const logDir = path.join(dataDir, "logs");
  const screenShareIceServers = readScreenShareIceServers(env.screenShareIceServers);
  const [
    { createLogger },
    { createWebServer },
    { WebSpeakDatabase },
    { loadOrCreateMasterSecret },
    { AdminService, parseAdminBootstrap },
    { JoinTicketStore },
  ] = await Promise.all([
    import("./shared/logger.js"),
    import("./transport/http/httpServer.js"),
    import("./infra/persistence/database.js"),
    import("./infra/security/masterSecret.js"),
    import("./modules/admin/index.js"),
    import("./modules/join/index.js"),
  ]);
  const logger = createLogger(logDir);
  const database = new WebSpeakDatabase(path.join(dataDir, "webspeak.db"));
  const pruned = database.pruneAudit();
  const masterSecret = loadOrCreateMasterSecret(path.join(dataDir, "master.key"));
  const adminService = new AdminService(database, masterSecret, logger, env.port, undefined, APP_VERSION);
  // The credentials in .env only matter on a fresh database, so they are not even checked once an account exists.
  adminService.pruneManagedInvites();
  const inviteSweep = setInterval(() => adminService.pruneManagedInvites(), INVITE_SWEEP_MS);
  inviteSweep.unref();
  await adminService.initialize(
    adminService.isInitialized() ? undefined : parseAdminBootstrap({ username: env.adminUsername, password: env.adminPassword }),
  );
  const joinTickets = new JoinTicketStore();

  logger.info({ dataDir }, "Starting WebSpeak server");
  if (pruned > 0) logger.info({ pruned }, "Trimmed the audit log");
  // One stray rejection must not take every live session down. A thrown exception still crashes on purpose.
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, "Unhandled promise rejection");
  });

  const hasCert = existsSync(path.join(CERT_DIR, "cert.pem"));

  const webServer = createWebServer({
    host: env.host,
    port: env.port,
    version: APP_VERSION,
    logFile: path.join(logDir, "webspeak.log"),
    staticDir: STATIC_DIR,
    certDir: hasCert ? CERT_DIR : undefined,
    voiceBridgeOptions: {
      joinTickets,
      webRtc: () => adminService.getWebRtcAudioOptions(),
      screenShareIceServers: () => screenShareIceServers,
      // The public gateway only uses the relay config saved in the admin console. Env vars are for the
      // standalone relay process and must not bring the relay option back after an admin disabled it.
      acceleration: () => adminService.getAccelerationRelayOptions(),
      accelerationName: () => adminService.getAccelerationRelayName(),
      clientVersion: env.tsClientVersion,
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
  const options = readRelayEnv();
  const server = await createAccelerationRelayServer(options);
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

main().catch((err: unknown) => {
  // A bad variable is the operator's to fix: the message says which one, a stack trace would only bury it.
  if (err instanceof EnvError || err instanceof AdminBootstrapError) console.error(`Configuration error: ${err.message}`);
  else console.error("Fatal error:", err);
  process.exit(1);
});
