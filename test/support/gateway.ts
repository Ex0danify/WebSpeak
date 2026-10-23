import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, type Mock, vi } from "vitest";
import { AdminService } from "../../src/modules/admin/adminService.js";
import { WebSpeakDatabase } from "../../src/infra/persistence/database.js";
import { JoinTicketStore, type JoinTicketPayload } from "../../src/modules/join/joinTicket.js";
import { createWebServer, type WebServer } from "../../src/transport/http/httpServer.js";
import { probeTeamSpeak, type TeamSpeakProbeResult } from "../../src/modules/teamspeak/teamSpeakProbe.js";
import type { TeamSpeakPingResult } from "../../src/modules/relay/networkProbe.js";
import type { VoiceBridgeOptions } from "../../src/modules/voice/voiceBridge.js";
import { BOOTSTRAP, MASTER_SECRET, stubLogger, type StubLogger } from "./adminService.js";
import { FakeTeamSpeakServer } from "./fakeTsClient.js";
import { WsClient } from "./wsClient.js";

/** The administrator password the harness sets unless `forcePasswordChange` is on. */
export const TEST_ADMIN_PASSWORD = "correct horse battery staple 42";

export interface GatewayOptions {
  /** The fake TeamSpeak server the gateway's sessions talk to. A fresh one by default. */
  ts?: FakeTeamSpeakServer;
  /**
   * Sessions use the bridge's own TSClient instead of the fake (layer 5), ts stays an unused fake.
   * The target comes from the admin settings (adminService.updateSettings).
   */
  realTeamSpeak?: boolean;
  /** Skip creating the administrator account, as on a database that was never set up. Default true. */
  initialize?: boolean;
  /**
   * What admin test connection does instead of the handshake. Succeeds by default, except with realTeamSpeak,
   * which gets the real probe and ping (gateway.probe and gateway.ping are not called).
   */
  probe?: (...args: Parameters<ProbeFn>) => Promise<TeamSpeakProbeResult>;
  /** The host ping next to the probe. Succeeds by default (no ICMP from the tests). */
  ping?: (host: string) => Promise<TeamSpeakPingResult>;
  /** Leave the first-run account (the bootstrap account, password change required) as it is. */
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
  delete(path: string): Promise<Response>;
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
  /** The stubs behind the admin connection test: the handshake probe and the host ping. */
  readonly probe: Mock<ProbeFn>;
  readonly ping: Mock<(host: string) => Promise<TeamSpeakPingResult>>;
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
  /** Closes the sockets from the client side, stops the gateway and removes the data directory. */
  close(): Promise<void>;
}

/**
 * Starts the real createWebServer on a free port with a temp data dir, a real AdminService and a fake TS server.
 * start() does not report the bound port, so it is picked first and nothing else is expected to grab it.
 */
export async function startGateway(options: GatewayOptions = {}): Promise<Gateway> {
  const dataDir = mkdtempSync(join(tmpdir(), "webspeak-gateway-"));
  const logger = stubLogger();
  const ts = options.ts ?? new FakeTeamSpeakServer();
  const database = new WebSpeakDatabase(join(dataDir, "webspeak.db"));
  const probe = vi.fn(options.probe ?? (async () => ({ ok: true as const, latencyMs: 12 })));
  const ping = vi.fn(
    options.ping ??
      (async () => ({ ok: true, latencyMs: 3, packetLossPercent: 0, attempts: 4, successfulAttempts: 4, samples: [3, 3, 3, 3] })),
  );
  // start() does not report the bound port, so it is picked first and nothing else is expected to grab it.
  const port = await freePort();
  const adminProbe = options.realTeamSpeak && !options.probe ? probeTeamSpeak : probe;
  const adminPing = options.realTeamSpeak && !options.ping ? undefined : ping;
  const adminService = new AdminService(database, MASTER_SECRET, logger, port, adminProbe as unknown as ProbeFn, "9.9.9", adminPing);
  if (options.initialize !== false) {
    await adminService.initialize(BOOTSTRAP);
    if (!options.forcePasswordChange) await adminService.changePassword(TEST_ADMIN_PASSWORD);
  }
  const joinTickets = new JoinTicketStore();
  const logFile = join(dataDir, "webspeak.log");
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
    ping,
    logFile,
    dataDir,
    request,
    ticket: (payload = {}) =>
      joinTickets.create({ target: { host: "ts.test", port: 9987 }, serverPassword: "", nickname: "tester", ...payload }),
    async openVoice(ticket = gateway.ticket()) {
      const socket = await WsClient.open(`${gateway.wsUrl}?ticket=${encodeURIComponent(ticket)}`);
      sockets.add(socket);
      return socket;
    },
    async adminLogin(password = TEST_ADMIN_PASSWORD) {
      const response = await request("/api/admin/login", jsonInit("POST", { username: "admin", password }));
      if (!response.ok) throw new Error(`admin login failed with HTTP ${response.status}`);
      const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
      const body = (await response.json()) as { csrfToken: string; mustChangePassword: boolean };
      const call = (method: string, path: string, payload?: unknown) =>
        request(path.startsWith("/") ? path : `/api/admin/${path}`, {
          ...jsonInit(method, payload),
          headers: {
            origin: url,
            cookie,
            "x-csrf-token": body.csrfToken,
            ...(payload === undefined ? {} : { "content-type": "application/json" }),
          },
        });
      return {
        csrfToken: body.csrfToken,
        cookie,
        mustChangePassword: body.mustChangePassword,
        get: (path) => call("GET", path),
        post: (path, payload) => call("POST", path, payload ?? {}),
        put: (path, payload) => call("PUT", path, payload ?? {}),
        delete: (path) => call("DELETE", path, {}),
      };
    },
    stop: () => webServer.stop(),
    close() {
      closing ??= (async () => {
        for (const socket of sockets) socket.close();
        await Promise.all([...sockets].map((socket) => socket.waitForClose().catch(() => undefined)));
        await webServer.stop();
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
