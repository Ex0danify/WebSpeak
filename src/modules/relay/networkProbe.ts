import { spawn } from "node:child_process";

export type TeamSpeakPingErrorCode =
  | "HOST_NOT_FOUND"
  | "UNREACHABLE"
  | "TIMEOUT"
  | "PING_UNAVAILABLE"
  | "INVALID_PASSWORD"
  | "PROTOCOL_NEGOTIATION_FAILED"
  | "SERVER_REJECTED"
  | "INTERNAL_ERROR";

export interface TeamSpeakPingAttempt {
  ok: boolean;
  latencyMs: number | null;
  errorCode?: TeamSpeakPingErrorCode;
}

export interface TeamSpeakPingResult {
  ok: boolean;
  latencyMs: number | null;
  packetLossPercent: number;
  attempts: number;
  successfulAttempts: number;
  samples: number[];
  errorCode?: TeamSpeakPingErrorCode;
}

export type TeamSpeakCommandExecutor = (command: string, timeoutMs?: number) => Promise<unknown>;

export type HostPingExecutor = (host: string, timeoutMs: number) => Promise<number>;

/**
 * Measure a connected TeamSpeak session over the protocol's own command channel.
 * Voice is UDP, so a TCP connect to 9987 is no reachability test and shows fake packet loss.
 */
export async function pingTeamSpeakSession(execute: TeamSpeakCommandExecutor, timeoutMs = 1_500): Promise<TeamSpeakPingAttempt> {
  const startedAt = Date.now();
  try {
    // read-only and works on TS3 and TS6
    await execute("version", timeoutMs);
    return { ok: true, latencyMs: Math.max(0, Date.now() - startedAt) };
  } catch (error: unknown) {
    return {
      ok: false,
      latencyMs: null,
      errorCode: classifyProbeError(error),
    };
  }
}

export async function collectTeamSpeakPings(
  probe: () => Promise<TeamSpeakPingAttempt>,
  options: { attempts?: number } = {},
): Promise<TeamSpeakPingResult> {
  const attempts = Math.max(1, Math.min(8, Math.floor(options.attempts ?? 4)));
  const results: TeamSpeakPingAttempt[] = [];
  // Sequential, so we measure the real path without several temporary sessions.
  for (let index = 0; index < attempts; index += 1) {
    results.push(await probe());
  }
  return summarizeTeamSpeakPings(results, attempts);
}

/**
 * Ping the TeamSpeak host from this machine without a TS client. Host diagnostic only,
 * it says nothing about the voice port (probeTeamSpeak decides that).
 */
export async function pingTeamSpeakHost(
  host: string,
  options: { attempts?: number; timeoutMs?: number; execute?: HostPingExecutor } = {},
): Promise<TeamSpeakPingResult> {
  const timeoutMs = Math.max(250, Math.min(5_000, Math.floor(options.timeoutMs ?? 1_000)));
  const execute = options.execute ?? pingHostOnce;
  return collectTeamSpeakPings(
    async () => {
      try {
        return { ok: true, latencyMs: await execute(host, timeoutMs) };
      } catch (error: unknown) {
        return { ok: false, latencyMs: null, errorCode: classifyProbeError(error) };
      }
    },
    { attempts: options.attempts ?? 4 },
  );
}

export function summarizeTeamSpeakPings(results: TeamSpeakPingAttempt[], attempts = results.length): TeamSpeakPingResult {
  const normalizedAttempts = Math.max(1, attempts);
  const samples = results
    .filter((result): result is TeamSpeakPingAttempt & { latencyMs: number } => result.ok && result.latencyMs !== null)
    .map((result) => result.latencyMs)
    .sort((left, right) => left - right);
  const errorCode = results.find((result) => result.errorCode)?.errorCode;

  return {
    ok: samples.length > 0,
    latencyMs: samples.length ? samples[Math.floor(samples.length / 2)] : null,
    packetLossPercent: Math.round(((normalizedAttempts - samples.length) / normalizedAttempts) * 100),
    attempts: normalizedAttempts,
    successfulAttempts: samples.length,
    samples,
    ...(errorCode ? { errorCode } : {}),
  };
}

function classifyProbeError(error: unknown): TeamSpeakPingErrorCode {
  const text = error instanceof Error ? error.message : String(error);
  const lower = text.toLocaleLowerCase();
  if (/enoent|spawn\s+(?:ping(?:\.exe)?|ping)\s+.*not found|command not found/.test(lower)) return "PING_UNAVAILABLE";
  if (/enotfound|eai_again|getaddrinfo|host not found|unknown host|could not find host|name or service not known/.test(lower))
    return "HOST_NOT_FOUND";
  if (/timeout|timed out|packet ack timeout|idle timeout/.test(lower)) return "TIMEOUT";
  // Keep the keywords narrow, bare words like password or denied show up in unrelated
  // ping output and would send the user to the wrong fix.
  if (/invalid password|password (?:required|incorrect|wrong|rejected)|authentication failed|invalid credential/.test(lower))
    return "INVALID_PASSWORD";
  if (
    /protocol (?:version )?(?:mismatch|not supported|error)|version (?:is )?(?:outdated|too old|not supported)|handshake (?:failed|error|timeout)|negotiation failed/.test(
      lower,
    )
  )
    return "PROTOCOL_NEGOTIATION_FAILED";
  if (
    /server (?:is )?full|slot limit|client protocol limit|banned?|flooding|server rejected|connection (?:denied|refused) by (?:the )?server/.test(
      lower,
    )
  )
    return "SERVER_REJECTED";
  return "UNREACHABLE";
}

function pingHostOnce(host: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const windows = process.platform === "win32";
    const command = windows ? "ping.exe" : "ping";
    const args = windows
      ? ["-n", "1", "-w", String(timeoutMs), host]
      : ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1_000))), host];
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(
      () =>
        finish(() => {
          child.kill();
          reject(new Error("ping timeout"));
        }),
      timeoutMs + 250,
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) =>
      finish(() => {
        const latencyMs = parsePingLatency(output);
        if (code === 0 && latencyMs !== null) {
          resolve(latencyMs);
          return;
        }
        reject(new Error(output.trim() || `ping exited with code ${code ?? "unknown"}`));
      }),
    );
  });
}

/**
 * Round-trip ms from ping output in any language, or null. Windows translates the time label
 * but keeps TTL=, so the number before it wins. Unix prints time=12.3 ms.
 */
export function parsePingLatency(output: string): number | null {
  const match = output.match(/[=<]\s*(\d+(?:[.,]\d+)?)\s*[^\d\s=<]*\s+TTL=/) ?? output.match(/\btime\s*[=<]\s*(\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const latencyMs = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : null;
}

/** Compat helper for callers that want one protocol attempt. No host or port, the session owns the endpoint. */
export function pingTeamSpeakPort(execute: TeamSpeakCommandExecutor, timeoutMs = 1_500): Promise<TeamSpeakPingAttempt> {
  return pingTeamSpeakSession(execute, timeoutMs);
}

/*
 * No raw TCP probe here, that is not the TeamSpeak protocol. The aggregation above stays
 * independent of connection setup so admin tests can inject a real probe.
 */
export async function pingTeamSpeak(
  probe: () => Promise<TeamSpeakPingAttempt>,
  options: { attempts?: number } = {},
): Promise<TeamSpeakPingResult> {
  return collectTeamSpeakPings(probe, options);
}
