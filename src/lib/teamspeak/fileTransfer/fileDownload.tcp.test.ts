import { createConnection } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { type FileServer, sendFile, startFileServer } from "../../../../test/support/tsFileServer.js";
import { FileTransferError } from "../errors/teamSpeakErrors.js";
import { readDownload } from "./fileDownload.js";
import type { DownloadTicket } from "./fileTransferTickets.js";

const KEY = "T+Y6vD4u8weCeEiVpQynNYuNiuegR6DJ";
const FILE = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7) & 0xff));

let server: FileServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const ticket = (port: number, size = FILE.length): DownloadTicket => ({ serverTransferId: 9, key: KEY, port, size: BigInt(size) });

async function failure(promise: Promise<unknown>): Promise<FileTransferError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(FileTransferError);
  return error as FileTransferError;
}

describe("readDownload", () => {
  it("sends the key and reads the announced bytes across chunks", async () => {
    server = await startFileServer(sendFile(FILE, 777));
    const data = await readDownload({ host: "127.0.0.1", ticket: ticket(server.port), maxBytes: 256 * 1024 });
    expect(data.equals(FILE)).toBe(true);
    expect(server.keys).toEqual([KEY]);
  });

  it("refuses a file over the limit without connecting", async () => {
    server = await startFileServer(sendFile(FILE));
    const error = await failure(readDownload({ host: "127.0.0.1", ticket: ticket(server.port), maxBytes: FILE.length - 1 }));
    expect(error.code).toBe("tooLarge");
    expect(server.keys).toEqual([]);
  });

  it("takes an empty file without connecting", async () => {
    server = await startFileServer(sendFile(FILE));
    expect(await readDownload({ host: "127.0.0.1", ticket: ticket(server.port, 0), maxBytes: 10 })).toHaveLength(0);
    expect(server.keys).toEqual([]);
  });

  it("fails a short read, like the server's answer to a wrong key", async () => {
    server = await startFileServer((socket) => socket.end());
    const error = await failure(readDownload({ host: "127.0.0.1", ticket: ticket(server.port), maxBytes: 1 << 20 }));
    expect(error.code).toBe("sizeMismatch");
    expect(error.message).toContain("after 0 of 5000 bytes");
  });

  it("fails when the server sends more than it announced", async () => {
    server = await startFileServer(sendFile(Buffer.concat([FILE, Buffer.alloc(10)]), 6000));
    expect((await failure(readDownload({ host: "127.0.0.1", ticket: ticket(server.port), maxBytes: 1 << 20 }))).code).toBe("sizeMismatch");
  });

  it("maps a refused connection to socketError", async () => {
    server = await startFileServer(sendFile(FILE));
    const port = server.port;
    await server.close();
    server = undefined;
    const error = await failure(readDownload({ host: "127.0.0.1", ticket: ticket(port), maxBytes: 1 << 20 }));
    expect(error.code).toBe("socketError");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("gives up on a silent server after the timeout", async () => {
    server = await startFileServer((socket) => socket.write(FILE.subarray(0, 10)));
    const error = await failure(readDownload({ host: "127.0.0.1", ticket: ticket(server.port), maxBytes: 1 << 20, timeoutMs: 50 }));
    expect(error.code).toBe("timeout");
    expect(error.message).toContain("got 10 of 5000 bytes");
  });

  it("stops on abort, also before it starts", async () => {
    server = await startFileServer(() => undefined);
    const reason = new Error("stop");
    const options = { host: "127.0.0.1", ticket: ticket(server.port), maxBytes: 1 << 20 };
    await expect(readDownload({ ...options, signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    const controller = new AbortController();
    const reading = readDownload({ ...options, signal: controller.signal });
    controller.abort(reason);
    await expect(reading).rejects.toBe(reason);
    const plain = new AbortController();
    const plainReading = readDownload({ ...options, signal: plain.signal });
    plain.abort("not an error");
    await expect(plainReading).rejects.toThrow("aborted");
  });

  it("uses the injected connect and checks the limit", async () => {
    const { port } = (server = await startFileServer(sendFile(FILE)));
    const seen: { host: string; port: number }[] = [];
    const connect = (address: { host: string; port: number }) => {
      seen.push(address);
      return createConnection(address);
    };
    await readDownload({ host: "127.0.0.1", ticket: ticket(port), maxBytes: 1 << 20, connect });
    expect(seen).toEqual([{ host: "127.0.0.1", port }]);
    expect(() => readDownload({ host: "127.0.0.1", ticket: ticket(port), maxBytes: -1 })).toThrow(RangeError);
  });
});
