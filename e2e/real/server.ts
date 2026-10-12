import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Logger } from "../../src/shared/logger";
import { poll } from "../helpers/poll";

const composeFile = fileURLToPath(new URL("./compose.yml", import.meta.url));
const runRoot = fileURLToPath(new URL("../../test-results/real", import.meta.url));

/** A logger for gateway clients used directly by the setup and by specs. */
export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => silentLogger };

/** The one variable that starts the server. A person sets it, no file in the repository does. */
export const LICENSE_VARIABLE = "WEBSPEAK_TEST_TS_LICENSE";

export function requireLicenseAccepted(env: NodeJS.ProcessEnv = process.env): void {
  if (env[LICENSE_VARIABLE] === "accept") return;
  throw new Error(
    [
      "The real-server tests start a TeamSpeak 6 server in Docker (teamspeaksystems/teamspeak6-server).",
      "That server has its own license, and it must be accepted by the person running the tests:",
      "read it with  docker run --rm --entrypoint cat teamspeaksystems/teamspeak6-server /opt/tsserver/LICENSE",
      `and, if you agree, run the tests with ${LICENSE_VARIABLE}=accept in your own environment:`,
      "",
      `  ${LICENSE_VARIABLE}=accept npm run test:real`,
      "",
      "Nothing in this repository sets it for you, and nothing was started.",
    ].join("\n"),
  );
}

/**
 * Everything that differs between two servers on one machine. Slot 0 is the default, another worktree or a second run picks
 * another with `WEBSPEAK_TEST_TS_SLOT`, which moves the ports, the compose project and the network together.
 */
export interface Slot {
  slot: number;
  project: string;
  voicePort: number;
  queryPort: number;
  subnet: string;
  /** The bridge's own address, where a published port's traffic appears to come from. */
  gateway: string;
}

export function slotFor(slot: number): Slot {
  if (!Number.isInteger(slot) || slot < 0 || slot > 100)
    throw new Error(`WEBSPEAK_TEST_TS_SLOT must be an integer from 0 to 100, got ${slot}`);
  const net = 87 + slot;
  return {
    slot,
    project: `webspeak-test-ts-${slot}`,
    voicePort: 19987 + slot,
    queryPort: 19080 + slot,
    subnet: `172.29.${net}.0/24`,
    gateway: `172.29.${net}.1`,
  };
}

/** What the query interface exempts from its own flood protection: the test client's addresses. */
export function allowListFor(slot: Slot): string {
  return ["127.0.0.1", "::1", slot.gateway, ""].join("\n");
}

/** What a spec needs to reach the server, passed from the global setup through the environment. */
export interface RealServer extends Slot {
  host: string;
  apiKey: string;
  runDir: string;
}

const ENV_KEY = "WEBSPEAK_REAL_TS";

export function realServerFromEnv(): RealServer {
  const raw = process.env[ENV_KEY];
  if (!raw) throw new Error("No real TeamSpeak server: run this through `npm run test:real`.");
  return JSON.parse(raw) as RealServer;
}

function compose(server: RealServer, args: string[], options: { allowFailure?: boolean } = {}): string {
  const result = spawnSync("docker", ["compose", "-f", composeFile, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      WEBSPEAK_TEST_TS_PROJECT: server.project,
      WEBSPEAK_TEST_TS_API_KEY: server.apiKey,
      WEBSPEAK_TEST_TS_VOICE_PORT: String(server.voicePort),
      WEBSPEAK_TEST_TS_QUERY_PORT: String(server.queryPort),
      WEBSPEAK_TEST_TS_SUBNET: server.subnet,
      WEBSPEAK_TEST_TS_RUN_DIR: server.runDir,
    },
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`docker compose ${args.join(" ")} failed (${result.status}):\n${result.stderr}${result.stdout}`);
  }
  return result.stdout + result.stderr;
}

/** A WebQuery answer, with `body` rows or an error `status`. Error 1281 (empty result) is not an error. */
interface WebQueryAnswer {
  body?: Record<string, string>[];
  status: { code: number; message: string };
}

export class WebQuery {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  static for(server: RealServer): WebQuery {
    return new WebQuery(`http://127.0.0.1:${server.queryPort}`, server.apiKey);
  }

  /** `command` is a ServerQuery command, `serverId` is the virtual server or null for the instance. */
  async call(
    command: string,
    params: Record<string, string | number> = {},
    serverId: number | null = 1,
  ): Promise<Record<string, string>[]> {
    const path = serverId === null ? `/${command}` : `/${serverId}/${command}`;
    const response = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const answer = (await response.json()) as WebQueryAnswer;
    if (answer.status.code !== 0 && answer.status.code !== 1281) {
      throw new Error(`WebQuery ${command} failed: ${answer.status.code} ${answer.status.message}`);
    }
    return answer.body ?? [];
  }

  async createChannel(name: string, extra: Record<string, string | number> = {}): Promise<string> {
    const [row] = await this.call("channelcreate", { channel_name: name, channel_flag_permanent: 1, ...extra });
    return row.cid;
  }
}

/**
 * Starts the server and waits until WebQuery answers with this run's key. The compose project is
 * removed first, so a run that was killed before its teardown does not leave a server behind.
 */
export async function startServer(slotNumber = Number(process.env.WEBSPEAK_TEST_TS_SLOT ?? 0)): Promise<RealServer> {
  requireLicenseAccepted();
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
  } catch {
    throw new Error("Docker is not running or not installed: `docker info` failed. The real-server tests need it.");
  }
  const slot = slotFor(slotNumber);
  const runDir = `${runRoot}/slot-${slot.slot}`;
  mkdirSync(runDir, { recursive: true });
  writeFileSync(`${runDir}/query_ip_allowlist.txt`, allowListFor(slot));
  const server: RealServer = { ...slot, host: "127.0.0.1", apiKey: `BA${randomBytes(28).toString("base64url")}`, runDir };
  compose(server, ["down", "--volumes", "--remove-orphans"], { allowFailure: true });
  compose(server, ["up", "--detach"]);
  try {
    await waitForQuery(server);
  } catch (error) {
    const logs = compose(server, ["logs", "--tail", "60", "tsserver"], { allowFailure: true });
    await stopServer(server);
    throw new Error(`${(error as Error).message}\n\nServer log:\n${logs}`, { cause: error });
  }
  return server;
}

/** Waits until WebQuery answers with this run's key. */
export async function waitForQuery(server: RealServer, timeoutMs = 90_000): Promise<void> {
  await poll(
    () =>
      fetch(`http://127.0.0.1:${server.queryPort}/version`, { headers: { "x-api-key": server.apiKey } }).then(
        (r) => r.ok,
        () => false,
      ),
    Boolean,
    { timeoutMs, intervalMs: 250, message: "the TeamSpeak server's WebQuery to answer" },
  );
}

/**
 * Stops the container without removing it, the way a crashed or restarted server looks to a client. The data directory is a
 * tmpfs, so the server `startContainer` brings back is empty (no channels or rights, default flood limits).
 */
export function stopContainer(server: RealServer): void {
  compose(server, ["stop", "--timeout", "1", "tsserver"]);
}

/** Starts a stopped container again (nothing happens when it is running). Does not wait for it. */
export function startContainer(server: RealServer): void {
  compose(server, ["start", "tsserver"]);
}

export async function stopServer(server: RealServer): Promise<void> {
  compose(server, ["down", "--volumes", "--remove-orphans"], { allowFailure: true });
}

export function exportToEnvironment(server: RealServer): void {
  process.env[ENV_KEY] = JSON.stringify(server);
}
