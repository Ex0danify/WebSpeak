import { existsSync } from "node:fs";

/** A missing or malformed variable. The message says which one, and is shown to the operator as it is. */
export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

/**
 * Loads a `.env` file into `process.env`; a variable that is already set wins over the file.
 * Returns whether the file exists. Containers have no file and get their variables from the runtime.
 */
export function loadEnvFile(path: string): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}

/**
 * There are no built-in defaults: `.env.example` is the one place they live, and a variable that is not set at all
 * stops the start. An empty value counts as set, for the variables `.env.example` leaves empty.
 */
function requireSet(env: NodeJS.ProcessEnv, names: string[]): void {
  const missing = names.filter((name) => env[name] === undefined);
  if (missing.length === 0) return;
  throw new EnvError(
    `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set. Copy .env.example to .env (next to package.json) and keep ` +
      "every variable in it, or set them in the environment.",
  );
}

function text(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

function requireText(env: NodeJS.ProcessEnv, name: string): string {
  const value = text(env, name);
  if (!value) throw new EnvError(`${name} must not be empty`);
  return value;
}

export function parsePort(value: string, name: string): number {
  const port = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new EnvError(`${name} must be a port between 1 and 65535`);
  return port;
}

/** A switch is 1 or 0, anything else is a typo that would otherwise silently count as off. */
export function parseSwitch(value: string, name: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new EnvError(`${name} must be 1 or 0`);
}

export type RunMode = "gateway" | "relay";

export function readMode(env: NodeJS.ProcessEnv = process.env): RunMode {
  requireSet(env, ["WEBSPEAK_MODE"]);
  const mode = text(env, "WEBSPEAK_MODE").toLowerCase();
  if (mode !== "gateway" && mode !== "relay") throw new EnvError("WEBSPEAK_MODE must be gateway or relay");
  return mode;
}

/** The data directory alone, for commands that open the database without starting the gateway. */
export function readDataDir(env: NodeJS.ProcessEnv = process.env): string {
  requireSet(env, ["WEBSPEAK_DATA_DIR"]);
  return requireText(env, "WEBSPEAK_DATA_DIR");
}

export interface GatewayEnv {
  /** The address to listen on, undefined for all interfaces. */
  host: string | undefined;
  port: number;
  /** As written; a relative path is relative to the install directory. */
  dataDir: string;
  trustProxy: boolean;
  /** The raw value, parsed where the ICE servers are normalized. Undefined for none. */
  screenShareIceServers: string | undefined;
  /** The raw bootstrap credentials, checked where the account is created. Only used on a fresh database. */
  adminUsername: string;
  adminPassword: string | undefined;
}

export function readGatewayEnv(env: NodeJS.ProcessEnv = process.env): GatewayEnv {
  requireSet(env, [
    "WEBSPEAK_ADMIN_USERNAME",
    "WEBSPEAK_ADMIN_PASSWORD",
    "WEBSPEAK_HOST",
    "WEBSPEAK_PORT",
    "WEBSPEAK_DATA_DIR",
    "WEBSPEAK_TRUST_PROXY",
    "WEBSPEAK_SCREEN_SHARE_ICE_SERVERS",
  ]);
  return {
    host: text(env, "WEBSPEAK_HOST") || undefined,
    port: parsePort(text(env, "WEBSPEAK_PORT"), "WEBSPEAK_PORT"),
    dataDir: requireText(env, "WEBSPEAK_DATA_DIR"),
    trustProxy: parseSwitch(text(env, "WEBSPEAK_TRUST_PROXY"), "WEBSPEAK_TRUST_PROXY"),
    screenShareIceServers: text(env, "WEBSPEAK_SCREEN_SHARE_ICE_SERVERS") || undefined,
    adminUsername: text(env, "WEBSPEAK_ADMIN_USERNAME"),
    adminPassword: env.WEBSPEAK_ADMIN_PASSWORD || undefined,
  };
}

export interface RelayEnv {
  token: string;
  host: string;
  port: number;
  allowPrivate: boolean;
}

export function readRelayEnv(env: NodeJS.ProcessEnv = process.env): RelayEnv {
  requireSet(env, ["WEBSPEAK_RELAY_TOKEN", "WEBSPEAK_RELAY_HOST", "WEBSPEAK_RELAY_PORT", "WEBSPEAK_RELAY_ALLOW_PRIVATE"]);
  return {
    token: requireText(env, "WEBSPEAK_RELAY_TOKEN"),
    host: requireText(env, "WEBSPEAK_RELAY_HOST"),
    port: parsePort(text(env, "WEBSPEAK_RELAY_PORT"), "WEBSPEAK_RELAY_PORT"),
    allowPrivate: parseSwitch(text(env, "WEBSPEAK_RELAY_ALLOW_PRIVATE"), "WEBSPEAK_RELAY_ALLOW_PRIVATE"),
  };
}
