// A TeamSpeak file transfer port on 127.0.0.1 for the own client's download tests. It reads the key
// and then does whatever the test asks: send a file, close, or keep quiet.
import { createServer, type Server, type Socket } from "node:net";

export type FileServerReply = (socket: Socket, key: string) => void;

export interface FileServer {
  port: number;
  /** Keys in the order clients sent them. */
  keys: string[];
  close(): Promise<void>;
}

/** Sends `data` in chunks of `chunkSize`, then closes like the real server does. */
export const sendFile =
  (data: Buffer, chunkSize = 1400): FileServerReply =>
  (socket) => {
    for (let offset = 0; offset < data.length; offset += chunkSize) socket.write(data.subarray(offset, offset + chunkSize));
    socket.end();
  };

export async function startFileServer(reply: FileServerReply, keyLength = 32): Promise<FileServer> {
  const keys: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    let text = "";
    socket.on("data", function onKey(chunk: Buffer) {
      text += chunk.toString("latin1");
      if (text.length < keyLength) return;
      socket.off("data", onKey);
      keys.push(text.slice(0, keyLength));
      reply(socket, text.slice(0, keyLength));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("file server has no port");
  return {
    port: address.port,
    keys,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
