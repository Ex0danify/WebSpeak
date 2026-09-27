import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, type Mock, vi } from "vitest";
import { AdminService } from "../../src/admin/admin-service.js";
import { WebSpeakDatabase } from "../../src/persistence/database.js";
import { JoinTicketStore, type JoinTicketPayload } from "../../src/server/join-ticket.js";
import { createWebServer, type WebServer } from "../../src/server/server.js";
import { probeTeamSpeak, type TeamSpeakProbeResult } from "../../src/server/teamspeak-probe.js";
import type { VoiceBridgeOptions } from "../../src/server/voice-bridge.js";
import { MASTER_SECRET, stubLogger, type StubLogger } from "./admin-service.js";
import { FakeTeamSpeakServer } from "./fake-ts-client.js";
import { WsClient } from "./ws-client.js";

/** The administrator password the harness sets unless `forcePasswordChange` is on. */
export const TEST_ADMIN_PASSWORD = "correct horse battery staple 42";

export interface GatewayOptions {
  /** The fake TeamSpeak server the gateway's sessions talk to. A fresh one by default. */
  ts?: FakeTeamSpeakServer;
  /**
   * Sessions use the bridge's own `TSClient` instead of the fake server, for layer 5. `ts` stays
   * an unused fake. The target is whatever the admin settings say (`adminService.updateSettings`).
   */
  realTeamSpeak?: boolean;
  /** Skip creating the administrator account, as on a database that was never set up. Default true. */
  initialize?: boolean;
  /** Written as the old `config.json` before the first start, to be imported once. */
  legacyConfig?: Record<string, unknown>;
  /**
   * What the admin "test connection" does instead of talking to a server. Succeeds by default,
   * except with `realTeamSpeak`: then the admin service gets the product's own probe, so the test
   * runs the host ping that production runs, and `gateway.probe` is not called.
   */
  probe?: (...args: Parameters<ProbeFn>) => Promise<TeamSpeakProbeResult>;
  /** Leave the first-run account (`admin` / `admin`, password change required) as it is. */
  forcePasswordChange?: boolean;
  /** Overrides for the `VoiceBridgeOptions` the harness wires like `src/index.ts` does. */
  voiceBridgeOptions?: Omit<VoiceBridgeOptions, "joinTickets" | "createClient">;
  staticDir?: string;
}

type ProbeFn = ConstructorParameters<typeof AdminService>[4] & {};

export interface AdminApi {
  readonly csrfToken: string;
  /** `name=value` of the session cookie, for requests that need to leave out the CSRF token or the origin. */
  readonly cookie: string;
  readonly mustChangePassword: boolean;
  get(path: string): Promise<Response>;
  post(path: string, body?: unknown): Promise<Response>;
  put(path: string, body?: unknown): Promise<Response>;
}

export interface Gateway {
  readonly url: string;
  readonly wsUrl: string;
  readonly ts: FakeTeamSpeakServer;
  readonly adminService: AdminService;
  readonly database: WebSpeakDatabase;
  readonly joinTickets: JoinTicketStore;
  readonly logger: StubLogger;
  /** Where the admin console looks for the gateway log. The file does not exist until a test writes it. */
  readonly logFile: string;
  /** The stub behind the admin connection test. */
  readonly probe: Mock<ProbeFn>;
  readonly dataDir: string;
  /** A request that comes from the gateway's own origin, like the browser app's. */
  request(path: string, init?: RequestInit): Promise<Response>;
  /** Puts a join ticket straight into the store, bypassing `/api/join-ticket` and its rate limit. */
  ticket(payload?: Partial<JoinTicketPayload>): string;
  /** Opens `/ws/voice` with a ticket (a fresh one for `nickname` by default). Closed with the gateway. */
  openVoice(ticket?: string): Promise<WsClient>;
  adminLogin(password?: string): Promise<AdminApi>;
  /** The gateway's own `stop()`, for tests of shutdown. `close()` still cleans up afterwards. */
  stop(): Promise<void>;
  /**
   * Closes the sockets from the client side, stops the gateway and removes the data directory.
   * `stopTimeoutMs` bounds the wait for `stop()`, for callers whose sockets the harness does not
   * hold (a browser): a session the gateway ended itself keeps `stop()` pending (F12).
   */
  close(options?: { stopTimeoutMs?: number }): Promise<void>;
}

/**
 * Starts the real `createWebServer` on a free port with a temporary data
 * directory, a real `AdminService`, and sessions that talk to a fake
 * TeamSpeak server. `useGateway` closes it after the test.
 *
 * `createWebServer.start()` does not report the port it bound, so the port
 * is picked first; nothing else on the machine is expected to take it in
 * between.
 */
export async function startGateway(options: GatewayOptions = {}): Promise<Gateway> {
  const dataDir = mkdtempSync(join(tmpdir(), "webspeak-gateway-"));
  const logger = stubLogger();
  const ts = options.ts ?? new FakeTeamSpeakServer();
  const database = new WebSpeakDatabase(join(dataDir, "webspeak.db"));
  const probe = vi.fn(options.probe ?? (async () => ({ ok: true as const, protocol: "ts6" as const, latencyMs: 12, serverName: "Fake TeamSpeak", requiresPassword: false })));
  if (options.legacyConfig) writeFileSync(join(dataDir, "config.json"), JSON.stringify(options.legacyConfig));
  const adminProbe = options.realTeamSpeak && !options.probe ? probeTeamSpeak : probe;
  const adminService = new AdminService(database, MASTER_SECRET, logger, join(dataDir, "config.json"), adminProbe as unknown as ProbeFn, "9.9.9");
  if (options.initialize !== false) {
    await adminService.initialize();
    if (!options.forcePasswordChange) await adminService.changePassword(TEST_ADMIN_PASSWORD);
  }
  const joinTickets = new JoinTicketStore();
  const logFile = join(dataDir, "webspeak.log");
  const port = await freePort();
  const webServer: WebServer = createWebServer({
    port,
    version: "9.9.9",
    logFile,
    staticDir: options.staticDir,
    // The same wiring as src/index.ts; `options.voiceBridgeOptions` can override any of it.
    voiceBridgeOptions: {
      webRtc: () => adminService.getWebRtcAudioOptions(),
      screenShareIceServers: () => [],
      acceleration: () => adminService.getAccelerationRelayOptions(),
      accelerationName: () => adminService.getAccelerationRelayName(),
      ...options.voiceBridgeOptions,
      joinTickets,
      createClient: options.realTeamSpeak ? undefined : ts.createClient,
    },
    adminService,
    logger,
    nextVisitorNumber: () => database.nextVisitorNumber(),
    visitorCount: () => database.getVisitorCount(),
  });
  await webServer.start();

  const url = `http://127.0.0.1:${port}`;
  const sockets = new Set<WsClient>();
  let closing: Promise<void> | null = null;
  const request = (path: string, init: RequestInit = {}) => fetch(url + path, { ...init, headers: { origin: url, ...init.headers } });
  const gateway: Gateway = {
    url,
    wsUrl: `ws://127.0.0.1:${port}/ws/voice`,
    ts,
    adminService,
    database,
    joinTickets,
    logger,
    probe,
    logFile,
    dataDir,
    request,
    ticket: (payload = {}) => joinTickets.create({ target: { host: "ts.test", port: 9987 }, serverPassword: "", nickname: "tester", ...payload }),
    async openVoice(ticket = gateway.ticket()) {
      const socket = await WsClient.open(`${gateway.wsUrl}?ticket=${encodeURIComponent(ticket)}`);
      sockets.add(socket);
      return socket;
    },
    async adminLogin(password = TEST_ADMIN_PASSWORD) {
      const response = await request("/api/admin/login", jsonInit("POST", { username: "admin", password }));
      if (!response.ok) throw new Error(`admin login failed with HTTP ${response.status}`);
      const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
      const body = await response.json() as { csrfToken: string; mustChangePassword: boolean };
      const call = (method: string, path: string, payload?: unknown) => request(path.startsWith("/") ? path : `/api/admin/${path}`, {
        ...jsonInit(method, payload),
        headers: { origin: url, cookie, "x-csrf-token": body.csrfToken, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
      });
      return {
        csrfToken: body.csrfToken,
        cookie,
        mustChangePassword: body.mustChangePassword,
        get: (path) => call("GET", path),
        post: (path, payload) => call("POST", path, payload ?? {}),
        put: (path, payload) => call("PUT", path, payload ?? {}),
      };
    },
    stop: () => webServer.stop(),
    close({ stopTimeoutMs }: { stopTimeoutMs?: number } = {}) {
      closing ??= (async () => {
        // Closing from the client side lets `ws` forget the socket. A socket the server closed
        // itself (kick, ban, connect failure) is never forgotten and `stop()` then never
        // finishes, see finding F12, so that case is not awaited.
        const closedByServer = [...sockets].some((socket) => socket.closeInfo !== null && !socket.closedLocally);
        for (const socket of sockets) socket.close();
        await Promise.all([...sockets].map((socket) => socket.waitForClose().catch(() => undefined)));
        const stopped = webServer.stop();
        if (closedByServer) void stopped.catch(() => undefined);
        else if (stopTimeoutMs === undefined) await stopped;
        else {
          let timer: ReturnType<typeof setTimeout>;
          const deadline = new Promise<void>((resolve) => { timer = setTimeout(resolve, stopTimeoutMs); });
          await Promise.race([stopped.catch(() => undefined), deadline]).finally(() => clearTimeout(timer));
        }
        database.close();
        rmSync(dataDir, { recursive: true, force: true });
      })();
      return closing;
    },
  };
  return gateway;
}

/** Registers an `afterEach` that closes every gateway started through `start`. */
export function useGateway() {
  const started: Gateway[] = [];
  afterEach(async () => {
    await Promise.all(started.splice(0).map((gateway) => gateway.close()));
  });
  return {
    async start(options?: GatewayOptions): Promise<Gateway> {
      const gateway = await startGateway(options);
      started.push(gateway);
      return gateway;
    },
  };
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}
