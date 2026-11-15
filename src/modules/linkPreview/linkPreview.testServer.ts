import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { FetchPolicy } from "./safeFetch.js";

export type Route = (request: IncomingMessage, response: ServerResponse) => void;

export interface TestServer {
  port: number;
  hits: Map<string, number>;
  /** Hosts the server was asked for, as the client sent them in the Host header. */
  hosts: string[];
  close(): Promise<void>;
}

export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);

export async function startServer(routes: Record<string, Route>): Promise<TestServer> {
  const hits = new Map<string, number>();
  const hosts: string[] = [];
  const table = new Map(Object.entries(routes));
  const server: Server = createServer((request, response) => {
    const path = request.url ?? "/";
    hits.set(path, (hits.get(path) ?? 0) + 1);
    hosts.push(String(request.headers.host));
    const route = table.get(path);
    if (!route) {
      response.writeHead(404).end();
      return;
    }
    route(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    hits,
    hosts,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export const send =
  (type: string, body: Buffer | string, status = 200): Route =>
  (_request, response) => {
    response.writeHead(status, { "content-type": type });
    response.end(body);
  };

export const redirect =
  (location: string, status = 302): Route =>
  (_request, response) => {
    response.writeHead(status, { location });
    response.end();
  };

/** A policy that lets the test reach its own server on 127.0.0.1 and names which addresses count as private. */
export function localPolicy(port: number, overrides: Partial<FetchPolicy> = {}): FetchPolicy {
  return {
    allowedPorts: [port],
    isRestricted: () => false,
    resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    timeoutMs: 2000,
    maxRedirects: 3,
    ...overrides,
  };
}
