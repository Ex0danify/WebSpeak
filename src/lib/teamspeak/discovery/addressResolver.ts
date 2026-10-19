import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { type HostAndPort, parseTsdnsAnswer, queryTsdns, TSDNS_PORT, type TsdnsQuery } from "./tsdns.js";

export const DEFAULT_SERVER_PORT = 9987;

export type AddressSource = "direct" | "srv" | "tsdnsSrv" | "tsdns" | "plain";

/** Host names stay names. Resolving them and checking the result is the caller's job. */
export interface ResolvedAddress extends HostAndPort {
  source: AddressSource;
}

export interface SrvRecord {
  name: string;
  port: number;
  priority: number;
  weight: number;
}

export interface SrvLookup {
  resolveSrv(name: string, signal: AbortSignal): Promise<SrvRecord[]>;
}

export interface ResolveAddressOptions {
  /** Used when no SRV or TSDNS record names one. Default 9987. */
  port?: number;
  /** Default true. Off skips both TSDNS steps. */
  tsdns?: boolean;
  /** Each lookup step gives up after this. Default 2 s. */
  stepTimeoutMs?: number;
  signal?: AbortSignal;
  srvLookup?: SrvLookup;
  tsdnsQuery?: TsdnsQuery;
  tsdnsPort?: number;
}

const systemSrvLookup: SrvLookup = {
  async resolveSrv(name, signal) {
    const resolver = new Resolver({ tries: 1 });
    const onAbort = () => resolver.cancel();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await resolver.resolveSrv(name);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  },
};

/** Suffixes with at least two labels, most specific first, at most three. */
function tsdnsDomains(host: string): string[] {
  const labels = host.split(".");
  const domains: string[] = [];
  for (let i = 0; i < labels.length - 1 && domains.length < 3; i++) domains.push(labels.slice(i).join("."));
  return domains;
}

function bySrvPreference(a: SrvRecord, b: SrvRecord): number {
  return a.priority - b.priority || b.weight - a.weight;
}

/**
 * The TeamSpeak lookup chain: SRV `_ts3._udp`, then TSDNS found through SRV `_tsdns._tcp`, then
 * TSDNS on port 41144 of the name and its parent domains, then the name itself. A failed or slow
 * step counts as no answer. Only an abort rejects. Names without a dot and `localhost` are taken
 * as they are, and there is no MyTeamSpeak nickname lookup.
 */
export async function resolveAddress(host: string, options: ResolveAddressOptions = {}): Promise<ResolvedAddress[]> {
  const name = host
    .trim()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "")
    .toLowerCase();
  const port = options.port ?? DEFAULT_SERVER_PORT;
  if (!name) throw new TypeError("TeamSpeak host is empty");
  if (!Number.isInteger(port) || port < 1 || port > 0xffff) throw new RangeError(`Invalid TeamSpeak port: ${port}`);
  const signal = options.signal;
  signal?.throwIfAborted();
  if (isIP(name)) return [{ host: name, port, source: "direct" }];
  const plain: ResolvedAddress[] = [{ host: name, port, source: "plain" }];
  if (!name.includes(".") || name === "localhost") return plain;

  const stepTimeoutMs = options.stepTimeoutMs ?? 2_000;
  const srvLookup = options.srvLookup ?? systemSrvLookup;
  const tsdnsQuery = options.tsdnsQuery ?? queryTsdns;
  // Every step ends on its own timeout or with the caller's abort, whichever comes first.
  const step = async <T>(run: (stepSignal: AbortSignal) => Promise<T | undefined>): Promise<T | undefined> => {
    const stepSignal = AbortSignal.any([AbortSignal.timeout(stepTimeoutMs), ...(signal ? [signal] : [])]);
    const result = await Promise.race([
      run(stepSignal).catch(() => undefined),
      new Promise<undefined>((resolve) => stepSignal.addEventListener("abort", () => resolve(undefined), { once: true })),
    ]);
    signal?.throwIfAborted();
    return result;
  };
  const srv = (record: string) => step((stepSignal) => srvLookup.resolveSrv(record, stepSignal));
  const ask = (server: HostAndPort, stepSignal: AbortSignal) =>
    tsdnsQuery(server, name, stepSignal).then((answer) => parseTsdnsAnswer(answer, port));

  const records = (await srv(`_ts3._udp.${name}`))?.filter((record) => record.port > 0 && record.name);
  if (records?.length) {
    return records.sort(bySrvPreference).map((record) => ({ host: record.name.replace(/\.$/, ""), port: record.port, source: "srv" }));
  }
  if (options.tsdns === false) return plain;

  const domains = tsdnsDomains(name);
  // Domains are asked side by side, the most specific answer wins.
  const viaSrv = await Promise.all(
    domains.map(async (domain) => {
      const servers = (await srv(`_tsdns._tcp.${domain}`)) ?? [];
      for (const server of servers.sort(bySrvPreference)) {
        const found = await step((stepSignal) => ask({ host: server.name.replace(/\.$/, ""), port: server.port }, stepSignal));
        if (found) return found;
      }
      return undefined;
    }),
  );
  const fromSrv = viaSrv.find((found) => found !== undefined);
  if (fromSrv) return [{ ...fromSrv, source: "tsdnsSrv" }];

  const tsdnsPort = options.tsdnsPort ?? TSDNS_PORT;
  const direct = await Promise.all(domains.map((domain) => step((stepSignal) => ask({ host: domain, port: tsdnsPort }, stepSignal))));
  const fromTsdns = direct.find((found) => found !== undefined);
  if (fromTsdns) return [{ ...fromTsdns, source: "tsdns" }];
  return plain;
}
