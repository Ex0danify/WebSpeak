import { isIP, createConnection } from "node:net";

export const TSDNS_PORT = 41144;

export interface HostAndPort {
  host: string;
  port: number;
}

/** Asks a TSDNS server for `name`. Resolves with its raw answer, or undefined for no answer. */
export type TsdnsQuery = (server: HostAndPort, name: string, signal: AbortSignal) => Promise<string | undefined>;

const MAX_ANSWER_BYTES = 512;
const HOST_NAME = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*\.?$/i;

/** Plain TCP: the name and a newline out, one line back (the server may close instead of ending it). */
export const queryTsdns: TsdnsQuery = (server, name, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve(undefined);
    const chunks: Buffer[] = [];
    let length = 0;
    let done = false;
    const socket = createConnection(server, () => socket.write(`${name}\n`));
    const finish = (answer: string | undefined) => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", onAbort);
      socket.destroy();
      resolve(answer);
    };
    const onAbort = () => finish(undefined);
    signal.addEventListener("abort", onAbort, { once: true });
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      length += chunk.length;
      const text = Buffer.concat(chunks).toString("utf8");
      const newline = text.indexOf("\n");
      if (newline >= 0) finish(text.slice(0, newline));
      else if (length > MAX_ANSWER_BYTES) finish(undefined);
    });
    socket.once("end", () => finish(Buffer.concat(chunks).toString("utf8")));
    socket.once("error", () => finish(undefined));
  });

/** `host:port`, `[v6]:port` or a bare host. `404` and `errors` mean the name is unknown. */
export function parseTsdnsAnswer(answer: string | undefined, fallbackPort: number): HostAndPort | undefined {
  const text = answer?.trim() ?? "";
  if (!text || text === "404" || text === "errors") return undefined;
  let host = text;
  let portText: string | undefined;
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(text);
  if (bracketed) {
    if (isIP(bracketed[1]!) !== 6) return undefined;
    host = bracketed[1]!;
    portText = bracketed[2];
  } else if (isIP(text) !== 6) {
    const colon = text.lastIndexOf(":");
    if (colon >= 0) {
      host = text.slice(0, colon);
      portText = text.slice(colon + 1);
    }
  }
  const port = portText === undefined ? fallbackPort : /^\d{1,5}$/.test(portText) ? Number(portText) : 0;
  if (port < 1 || port > 0xffff) return undefined;
  if (!isIP(host) && !HOST_NAME.test(host)) return undefined;
  return { host: host.replace(/\.$/, ""), port };
}
