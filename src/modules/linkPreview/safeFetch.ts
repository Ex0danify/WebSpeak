import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isRestrictedAddress } from "../../infra/security/openTargetPolicy.js";

/** Why a page could not be fetched. `blocked` is the SSRF policy, the rest is the remote side or the limits. */
export type FetchFailure = "blocked" | "failed" | "too-large" | "unsupported";

export class FetchError extends Error {
  constructor(
    readonly reason: FetchFailure,
    message: string,
    /** The size the remote host announced, when it did. */
    readonly announcedBytes?: number,
    /** The type the remote host announced, for a file that was refused for its size. */
    readonly contentType?: string,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchPolicy {
  allowedPorts: readonly number[];
  isRestricted(address: string): boolean;
  resolve(host: string): Promise<Array<{ address: string; family: number }>>;
  timeoutMs: number;
  maxRedirects: number;
}

export const DEFAULT_FETCH_POLICY: FetchPolicy = {
  allowedPorts: [80, 443],
  isRestricted: isRestrictedAddress,
  resolve: (host) => lookup(host, { all: true, verbatim: true }),
  timeoutMs: 5000,
  maxRedirects: 3,
};

export interface FetchedResource {
  /** The address after redirects. */
  url: URL;
  contentType: string;
  body: Buffer;
  /** The body was cut at the limit, which is fine for a page head and wrong for an image. */
  truncated: boolean;
}

export interface FetchRequest {
  url: URL;
  accept: string;
  /** Called with the Content-Type once the headers are in, returns how many bytes of the body to read, or 0 to refuse it. */
  limitFor(contentType: string): number;
  /** Cut at the limit instead of failing, for a page head. */
  cutAtLimit?: boolean;
}

const USER_AGENT = "WebSpeak-LinkPreview (+https://github.com/Ex0danify/WebSpeak)";
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

type Answer = { address: string; family: number };

function portOf(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

/** The addresses a name resolves to. Every answer has to be public, one private address among them refuses the host. */
async function checkedAddresses(url: URL, policy: FetchPolicy): Promise<Answer[]> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("blocked", "Only http and https are fetched");
  if (url.username || url.password) throw new FetchError("blocked", "Addresses with credentials are not fetched");
  if (!policy.allowedPorts.includes(portOf(url))) throw new FetchError("blocked", "This port is not fetched");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(host);
  let answers: Answer[];
  try {
    answers = literal ? [{ address: host, family: literal }] : await policy.resolve(host);
  } catch {
    throw new FetchError("failed", "The host did not resolve");
  }
  if (answers.length === 0) throw new FetchError("failed", "The host did not resolve");
  if (answers.some(({ address }) => policy.isRestricted(address))) throw new FetchError("blocked", "The host is on a private network");
  return answers;
}

function readBody(
  response: IncomingMessage,
  limit: number,
  cutAtLimit: boolean,
  announced: number | undefined,
  contentType: string,
): Promise<{ body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        response.destroy();
        if (cutAtLimit) resolve({ body: Buffer.concat(chunks), truncated: true });
        else reject(new FetchError("too-large", "The file is larger than the limit", announced, contentType));
        return;
      }
      chunks.push(chunk);
    });
    response.on("end", () => resolve({ body: Buffer.concat(chunks), truncated: false }));
    response.on("error", () => reject(new FetchError("failed", "The connection broke")));
    response.on("close", () => {
      if (!response.complete && size <= limit) reject(new FetchError("failed", "The connection broke"));
    });
  });
}

/**
 * Answers every lookup of the connection from the addresses that were checked. Node asks for the whole list when it tries both
 * address families, so a host with an IPv6 address first still works on a gateway that only has IPv4.
 */
function pinnedLookup(answers: readonly Answer[]): LookupFunction {
  return (_host, options, callback) => {
    if (options.all) callback(null, [...answers]);
    else callback(null, answers[0]!.address, answers[0]!.family);
  };
}

function once(url: URL, answers: readonly Answer[], request: FetchRequest, timeoutMs: number): Promise<IncomingMessage> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const outgoing = send(
      url,
      {
        method: "GET",
        // Only the checked addresses are connected to, a second DNS answer cannot move the request.
        lookup: pinnedLookup(answers),
        headers: { accept: request.accept, "user-agent": USER_AGENT, "accept-encoding": "identity" },
        agent: false,
        timeout: timeoutMs,
      },
      resolve,
    );
    outgoing.on("timeout", () => outgoing.destroy(new FetchError("failed", "The host took too long")));
    outgoing.on("error", (error) => reject(error instanceof FetchError ? error : new FetchError("failed", "The request failed")));
    outgoing.end();
  });
}

/**
 * GET with the checks a public gateway needs before it touches an address a stranger chose: scheme, port, a public
 * address that is also the one connected to, redirects checked hop by hop, a time limit and a size limit. No cookies
 * and no credentials are sent.
 */
export async function safeGet(request: FetchRequest, policy: FetchPolicy = DEFAULT_FETCH_POLICY): Promise<FetchedResource> {
  const deadline = Date.now() + policy.timeoutMs;
  let url = request.url;
  for (let hop = 0; hop <= policy.maxRedirects; hop++) {
    const answers = await checkedAddresses(url, policy);
    // One time limit for the whole chain of redirects and the body, not one per hop.
    const response = await once(url, answers, request, Math.max(1, deadline - Date.now()));
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (REDIRECTS.has(status) && location) {
      response.resume();
      if (hop === policy.maxRedirects) throw new FetchError("failed", "Too many redirects");
      try {
        url = new URL(location, url);
      } catch {
        throw new FetchError("failed", "The redirect is not an address");
      }
      continue;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      throw new FetchError("failed", `The host answered ${status}`);
    }
    const contentType = String(response.headers["content-type"] ?? "")
      .split(";", 1)[0]!
      .trim()
      .toLowerCase();
    const limit = request.limitFor(contentType);
    if (limit <= 0) {
      response.destroy();
      throw new FetchError("unsupported", "This kind of file is not previewed");
    }
    const announcedHeader = Number(response.headers["content-length"]);
    const announced = Number.isFinite(announcedHeader) && announcedHeader >= 0 ? announcedHeader : undefined;
    if (!request.cutAtLimit && announced !== undefined && announced > limit) {
      response.destroy();
      throw new FetchError("too-large", "The file is larger than the limit", announced, contentType);
    }
    const remaining = Math.max(1, deadline - Date.now());
    const timer = setTimeout(() => response.destroy(), remaining);
    try {
      const { body, truncated } = await readBody(response, limit, request.cutAtLimit === true, announced, contentType);
      return { url, contentType, body, truncated };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FetchError("failed", "Too many redirects");
}
