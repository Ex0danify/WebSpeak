import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";

export class UnsafeTeamSpeakTargetError extends Error {
  constructor(message = "This TeamSpeak target is not allowed in open mode") {
    super(message);
    this.name = "UnsafeTeamSpeakTargetError";
  }
}

/** Resolve and reject addresses that could turn a public gateway into an internal network probe. */
export async function assertSafeOpenTarget(target: TeamSpeakTarget): Promise<void> {
  await resolveSafeOpenTarget(target);
}

export async function resolveSafeOpenTarget(target: TeamSpeakTarget): Promise<TeamSpeakTarget> {
  const literalVersion = isIP(target.host);
  const addresses = literalVersion
    ? [{ address: target.host, family: literalVersion }]
    : await lookup(target.host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isRestrictedAddress(address))) {
    throw new UnsafeTeamSpeakTargetError();
  }
  // Use the address that was actually validated so a second DNS lookup cannot
  // rebind the gateway connection to a private network.
  return { host: addresses[0]!.address, port: target.port };
}

export function isRestrictedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isRestrictedIpv4(address);
  if (version !== 6) return true;

  const normalized = address.toLocaleLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) !== 4 || isRestrictedIpv4(mapped);
  }
  if (normalized.startsWith("::")) return true; // IPv4-compatible and other special compressed forms
  const first = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((first & 0xffc0) === 0xfec0) return true; // deprecated site-local fec0::/10
  if ((first & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if (normalized.startsWith("2001:db8:")) return true; // documentation range
  const groups = ipv6Groups(normalized);
  if (!groups) return true;
  // Forms that carry an IPv4 address are judged by that address.
  if (groups[0] === 0x64 && groups[1] === 0xff9b) {
    if (groups.slice(2, 6).every((group) => group === 0)) return isRestrictedIpv4(ipv4Of(groups[6]!, groups[7]!)); // NAT64 64:ff9b::/96
    return true; // 64:ff9b:1::/48, local-use NAT64
  }
  if (groups[0] === 0x2002) return isRestrictedIpv4(ipv4Of(groups[1]!, groups[2]!)); // 6to4 2002::/16
  if (groups[0] === 0x2001 && groups[1] === 0) return true; // Teredo 2001::/32
  if (groups.slice(0, 4).every((group, index) => group === (index === 0 ? 0x100 : 0))) return true; // discard-only 100::/64
  return false;
}

function ipv4Of(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/** The eight 16-bit groups of a valid IPv6 address, or undefined when it cannot be read. */
function ipv6Groups(address: string): number[] | undefined {
  let text = address.split("%", 1)[0]!;
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const octets = dotted[2]!.split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return undefined;
    text = `${dotted[1]}${((octets[0]! << 8) | octets[1]!).toString(16)}:${((octets[2]! << 8) | octets[3]!).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const toGroups = (part: string) => (part ? part.split(":").map((group) => Number.parseInt(group, 16)) : []);
  const head = toGroups(halves[0]!);
  const tail = halves.length === 2 ? toGroups(halves[1]!) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return undefined;
  const groups = [...head, ...new Array<number>(halves.length === 2 ? missing : 0).fill(0), ...tail];
  return groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff) ? undefined : groups;
}

function isRestrictedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2))
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && parts[2] === 100)
    || (a === 203 && b === 0 && parts[2] === 113)
    || a >= 224;
}
