import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_FETCH_POLICY, FetchError, safeGet, type FetchRequest } from "./safeFetch.js";
import { localPolicy, PNG, redirect, send, startServer, type TestServer } from "./linkPreview.testServer.js";

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const get = (url: string, limit = 1000, extra: Partial<FetchRequest> = {}): FetchRequest => ({
  url: new URL(url),
  accept: "*/*",
  limitFor: () => limit,
  ...extra,
});
const failure = async (promise: Promise<unknown>) =>
  (await promise.then(
    () => null,
    (error: unknown) => error,
  )) as FetchError;

describe("safeGet policy with the real address check", () => {
  it.each([
    "http://127.0.0.1/",
    "http://localhost/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://0.0.0.0/",
  ])("refuses %s", async (address) => {
    const error = await failure(safeGet(get(address)));
    expect(error).toBeInstanceOf(FetchError);
    expect(error.reason).toBe("blocked");
  });

  it.each(["ftp://example.com/", "file:///etc/passwd", "gopher://example.com/", "javascript:alert(1)"])(
    "refuses the scheme of %s",
    async (address) => {
      expect((await failure(safeGet(get(address)))).reason).toBe("blocked");
    },
  );

  it("refuses credentials in the address and ports other than 80 and 443", async () => {
    const policy = { ...DEFAULT_FETCH_POLICY, resolve: async () => [{ address: "93.184.216.34", family: 4 }] };
    expect((await failure(safeGet(get("http://user:pass@example.com/"), policy))).reason).toBe("blocked");
    expect((await failure(safeGet(get("http://example.com:22/"), policy))).reason).toBe("blocked");
    expect((await failure(safeGet(get("https://example.com:8443/"), policy))).reason).toBe("blocked");
  });

  it("refuses a host when any of its answers is private", async () => {
    const policy = {
      ...DEFAULT_FETCH_POLICY,
      resolve: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    };
    expect((await failure(safeGet(get("http://mixed.example/"), policy))).reason).toBe("blocked");
  });

  it("reports a host that does not resolve", async () => {
    const policy = { ...DEFAULT_FETCH_POLICY, resolve: async () => Promise.reject(new Error("ENOTFOUND")) };
    expect((await failure(safeGet(get("http://nowhere.example/"), policy))).reason).toBe("failed");
  });
});

describe("safeGet against a local server", () => {
  it("fetches a body and reports the type", async () => {
    server = await startServer({ "/a": send("text/plain; charset=utf-8", "hello") });
    const result = await safeGet(get(`http://page.test:${server.port}/a`), localPolicy(server.port));
    expect(result.body.toString()).toBe("hello");
    expect(result.contentType).toBe("text/plain");
    expect(result.truncated).toBe(false);
  });

  it("connects to the checked address, whatever the name resolves to later", async () => {
    server = await startServer({ "/a": send("text/plain", "ok") });
    let lookups = 0;
    const policy = localPolicy(server.port, {
      resolve: async () => (lookups++ === 0 ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "10.0.0.1", family: 4 }]),
    });
    await safeGet(get(`http://rebind.test:${server.port}/a`), policy);
    expect(lookups).toBe(1);
    expect(server.hosts[0]).toBe(`rebind.test:${server.port}`);
  });

  it("connects through the second checked address when the first is unreachable", async () => {
    server = await startServer({ "/a": send("text/plain", "ok") });
    const policy = localPolicy(server.port, {
      resolve: async () => [
        { address: "::1", family: 6 },
        { address: "127.0.0.1", family: 4 },
      ],
    });
    const result = await safeGet(get(`http://dual.test:${server.port}/a`), policy);
    expect(result.body.toString()).toBe("ok");
  });

  it("follows redirects and checks every hop", async () => {
    server = await startServer({
      "/start": redirect("/middle"),
      "/middle": redirect("/end", 307),
      "/end": send("text/plain", "done"),
    });
    const policy = localPolicy(server.port);
    const result = await safeGet(get(`http://page.test:${server.port}/start`), policy);
    expect(result.body.toString()).toBe("done");
    expect(result.url.pathname).toBe("/end");
  });

  it("refuses a redirect into a private address and never asks it", async () => {
    let port = 0;
    server = await startServer({
      "/go": (_request, response) => {
        response.writeHead(302, { location: `http://internal.test:${port}/secret` });
        response.end();
      },
      "/secret": send("text/plain", "private"),
    });
    port = server.port;
    const policy = localPolicy(port, {
      resolve: async (host) => [{ address: host === "internal.test" ? "10.0.0.5" : "127.0.0.1", family: 4 }],
      isRestricted: (address) => address === "10.0.0.5",
    });
    expect((await failure(safeGet(get(`http://page.test:${port}/go`), policy))).reason).toBe("blocked");
    expect(server.hits.get("/secret")).toBeUndefined();
  });

  it("stops after too many redirects and on a redirect that is not an address", async () => {
    server = await startServer({ "/loop": redirect("/loop"), "/bad": redirect("http://[bad") });
    const policy = localPolicy(server.port);
    expect((await failure(safeGet(get(`http://page.test:${server.port}/loop`), policy))).reason).toBe("failed");
    expect((await failure(safeGet(get(`http://page.test:${server.port}/bad`), policy))).reason).toBe("failed");
  });

  it("fails on an error status", async () => {
    server = await startServer({ "/gone": send("text/plain", "no", 404) });
    expect((await failure(safeGet(get(`http://page.test:${server.port}/gone`), localPolicy(server.port)))).reason).toBe("failed");
  });

  it("refuses a body over the limit, announced or streamed", async () => {
    server = await startServer({
      "/big": (_request, response) => {
        response.writeHead(200, { "content-type": "application/octet-stream", "content-length": 5000 });
        response.end(Buffer.alloc(5000));
      },
      "/stream": (_request, response) => {
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.write(Buffer.alloc(800));
        response.end(Buffer.alloc(800));
      },
    });
    const policy = localPolicy(server.port);
    const announced = await failure(safeGet(get(`http://page.test:${server.port}/big`, 1000), policy));
    expect(announced.reason).toBe("too-large");
    expect(announced.announcedBytes).toBe(5000);
    expect((await failure(safeGet(get(`http://page.test:${server.port}/stream`, 1000), policy))).reason).toBe("too-large");
  });

  it("cuts a body at the limit when asked to, for a page head", async () => {
    server = await startServer({ "/page": send("text/html", Buffer.alloc(5000, 97)) });
    const result = await safeGet(get(`http://page.test:${server.port}/page`, 1000, { cutAtLimit: true }), localPolicy(server.port));
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBeLessThanOrEqual(1000);
  });

  it("refuses a type the caller does not want before reading the body", async () => {
    server = await startServer({ "/zip": send("application/zip", PNG) });
    const error = await failure(safeGet({ ...get(`http://page.test:${server.port}/zip`), limitFor: () => 0 }, localPolicy(server.port)));
    expect(error.reason).toBe("unsupported");
  });

  it("gives up on a host that answers too slowly", async () => {
    server = await startServer({ "/slow": () => undefined });
    const error = await failure(safeGet(get(`http://page.test:${server.port}/slow`), localPolicy(server.port, { timeoutMs: 150 })));
    expect(error.reason).toBe("failed");
  });

  it("gives up on a body that stalls", async () => {
    server = await startServer({
      "/stall": (_request, response) => {
        response.writeHead(200, { "content-type": "text/plain" });
        response.write("start");
      },
    });
    const error = await failure(safeGet(get(`http://page.test:${server.port}/stall`), localPolicy(server.port, { timeoutMs: 300 })));
    expect(error.reason).toBe("failed");
  });

  it("sends no cookies or credentials and asks for no compression", async () => {
    let seen: Record<string, unknown> = {};
    server = await startServer({
      "/h": (request, response) => {
        seen = { ...request.headers };
        response.end("ok");
      },
    });
    await safeGet(get(`http://page.test:${server.port}/h`), localPolicy(server.port));
    expect(seen.cookie).toBeUndefined();
    expect(seen.authorization).toBeUndefined();
    expect(seen["accept-encoding"]).toBe("identity");
    expect(String(seen["user-agent"])).toContain("WebSpeak");
  });
});
