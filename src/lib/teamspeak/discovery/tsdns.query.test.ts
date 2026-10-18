import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseTsdnsAnswer, queryTsdns } from "./tsdns.js";

let server: Server | undefined;
const sockets = new Set<Socket>();
afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

/** A TSDNS server that answers every query with `reply`. */
async function tsdnsServer(reply: (socket: Socket, query: string) => void): Promise<{ host: string; port: number; queries: string[] }> {
  const queries: string[] = [];
  server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.once("data", (chunk: Buffer) => {
      queries.push(chunk.toString("utf8"));
      reply(socket, chunk.toString("utf8"));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { host: "127.0.0.1", port: address.port, queries };
}

const signal = () => new AbortController().signal;

describe("queryTsdns", () => {
  it("sends the name and reads one line", async () => {
    const tsdns = await tsdnsServer((socket) => socket.write("198.51.100.4:9999\nignored"));
    expect(await queryTsdns(tsdns, "ts.example.com", signal())).toBe("198.51.100.4:9999");
    expect(tsdns.queries).toEqual(["ts.example.com\n"]);
  });

  it("takes an answer that ends with the connection", async () => {
    const tsdns = await tsdnsServer((socket) => {
      socket.write("198.51.");
      socket.end("100.4:9999");
    });
    expect(await queryTsdns(tsdns, "ts.example.com", signal())).toBe("198.51.100.4:9999");
  });

  it("gives up on an answer that is too long", async () => {
    const tsdns = await tsdnsServer((socket) => socket.write("x".repeat(600)));
    expect(await queryTsdns(tsdns, "ts.example.com", signal())).toBeUndefined();
  });

  it("answers undefined for a refused connection and on abort", async () => {
    const tsdns = await tsdnsServer(() => undefined);
    const controller = new AbortController();
    const asking = queryTsdns(tsdns, "ts.example.com", controller.signal);
    controller.abort();
    expect(await asking).toBeUndefined();
    expect(await queryTsdns(tsdns, "ts.example.com", AbortSignal.abort())).toBeUndefined();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    expect(await queryTsdns(tsdns, "ts.example.com", signal())).toBeUndefined();
  });
});

describe("parseTsdnsAnswer", () => {
  it("reads host and port in every form", () => {
    expect(parseTsdnsAnswer(" 198.51.100.4:9999 ", 9987)).toEqual({ host: "198.51.100.4", port: 9999 });
    expect(parseTsdnsAnswer("voice.example.com.", 9988)).toEqual({ host: "voice.example.com", port: 9988 });
    expect(parseTsdnsAnswer("[2001:db8::1]:9999", 9987)).toEqual({ host: "2001:db8::1", port: 9999 });
    expect(parseTsdnsAnswer("[2001:db8::1]", 9987)).toEqual({ host: "2001:db8::1", port: 9987 });
    expect(parseTsdnsAnswer("2001:db8::1", 9987)).toEqual({ host: "2001:db8::1", port: 9987 });
  });

  it("refuses unknown names and anything that is not an address", () => {
    for (const answer of [
      undefined,
      "",
      "404",
      "errors",
      "host:0",
      "host:65536",
      "host:abc",
      "bad host:1",
      "[voice.example.com]:1",
      "a/b:1",
    ]) {
      expect(parseTsdnsAnswer(answer, 9987)).toBeUndefined();
    }
  });
});
