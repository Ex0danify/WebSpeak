import { createConnection, type Socket } from "node:net";
import { FileTransferError } from "../errors/teamSpeakErrors.js";
import type { DownloadTicket } from "./fileTransferTickets.js";

export type TcpConnect = (address: { host: string; port: number }) => Socket;

export interface ReadDownloadOptions {
  /** The server's host. The ticket only carries the port. */
  host: string;
  ticket: DownloadTicket;
  /** Larger files are refused before any byte is read. */
  maxBytes: number;
  /** For the whole read. Default 10 s. */
  timeoutMs?: number;
  signal?: AbortSignal;
  connect?: TcpConnect;
}

const defaultConnect: TcpConnect = ({ host, port }) => createConnection({ host, port });

/** Reads exactly the announced size. Fewer or more bytes fail the download. */
export function readDownload(options: ReadDownloadOptions): Promise<Buffer> {
  const { host, ticket, maxBytes, signal } = options;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError(`Invalid download limit: ${maxBytes}`);
  if (ticket.size > BigInt(maxBytes)) {
    return Promise.reject(new FileTransferError("tooLarge", `TeamSpeak file has ${ticket.size} bytes, the limit is ${maxBytes}`));
  }
  if (signal?.aborted) return Promise.reject(signal.reason);
  const size = Number(ticket.size);
  // The server opens the transfer for the key alone, an empty file needs no connection.
  if (size === 0) return Promise.resolve(Buffer.alloc(0));

  return new Promise((resolve, reject) => {
    const data = Buffer.allocUnsafe(size);
    let received = 0;
    let done = false;
    const socket = (options.connect ?? defaultConnect)({ host, port: ticket.port });
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket.destroy();
      if (error) reject(error);
      else resolve(data);
    };
    const onAbort = () => finish(signal!.reason instanceof Error ? signal!.reason : new Error("aborted"));
    const timeoutMs = options.timeoutMs ?? 10_000;
    const timer = setTimeout(
      () => finish(new FileTransferError("timeout", `TeamSpeak download got ${received} of ${size} bytes within ${timeoutMs} ms`)),
      timeoutMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });

    socket.once("connect", () => socket.write(ticket.key));
    socket.on("data", (chunk: Buffer) => {
      if (received + chunk.length > size) {
        return finish(new FileTransferError("sizeMismatch", `TeamSpeak sent more than the announced ${size} bytes`));
      }
      chunk.copy(data, received);
      received += chunk.length;
      if (received === size) finish();
    });
    // A wrong or expired key makes the server close without sending anything.
    socket.once("close", () =>
      finish(new FileTransferError("sizeMismatch", `TeamSpeak closed the download after ${received} of ${size} bytes`)),
    );
    socket.once("error", (error) =>
      finish(new FileTransferError("socketError", `TeamSpeak download failed: ${error.message}`, { cause: error })),
    );
  });
}
