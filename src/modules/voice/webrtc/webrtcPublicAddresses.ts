import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type Lookup = (host: string, options: { all: true; family: 4 }) => Promise<Array<{ address: string }>>;

const DNS_TIMEOUT_MS = 1_500;

/**
 * The IPv4 addresses to put in the answer's ICE candidates for the host the browser reached the gateway by. A candidate
 * must carry an IP, not a name, so a domain is resolved here. A name that does not resolve in time gives no address and
 * the peer connection falls back to the addresses it finds on its own interfaces.
 */
export async function resolveWebRtcPublicAddresses(
  host: string | undefined,
  resolve: Lookup = lookup as Lookup,
  timeoutMs = DNS_TIMEOUT_MS,
): Promise<string[]> {
  if (!host) return [];
  const family = isIP(host);
  if (family === 4) return [host];
  if (family === 6) return [];
  let timer: NodeJS.Timeout | undefined;
  try {
    const found = await Promise.race([
      resolve(host, { all: true, family: 4 }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS lookup timed out")), timeoutMs);
      }),
    ]);
    return [...new Set(found.map((entry) => entry.address).filter((address) => isIP(address) === 4))];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
