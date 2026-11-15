import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LINK_PREVIEW_LIMITS, type LinkPreviewLimits } from "../../config/linkPreviewConfig.js";
import { LinkPreviewError, LinkPreviewService, parsePreviewUrl } from "./linkPreviewService.js";
import { localPolicy, PNG, send, startServer, type Route, type TestServer } from "./linkPreview.testServer.js";

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const BIG_PNG = Buffer.concat([PNG, Buffer.alloc(3000, 2)]);
const sized =
  (type: string, body: Buffer): Route =>
  (_request, response) => {
    response.writeHead(200, { "content-type": type, "content-length": body.length });
    response.end(body);
  };

async function start(routes: Parameters<typeof startServer>[0], limits: Partial<LinkPreviewLimits> = {}, concurrency?: number) {
  server = await startServer(routes);
  const effective = { ...DEFAULT_LINK_PREVIEW_LIMITS, ...limits };
  const service = new LinkPreviewService({ getLimits: () => effective, policy: localPolicy(server.port), concurrency });
  return { service, base: `http://site.test:${server.port}`, limits: effective };
}

const reason = async (promise: Promise<unknown>) =>
  (
    (await promise.then(
      () => null,
      (error: unknown) => error,
    )) as LinkPreviewError | null
  )?.reason;

describe("parsePreviewUrl", () => {
  it.each(["https://example.com/a?b=1#c", "http://example.com"])("accepts %s", (value) => {
    expect(parsePreviewUrl(value)).toBeInstanceOf(URL);
  });

  it.each(["", "example.com", "ftp://example.com", "javascript:alert(1)", "data:text/html,hi", `https://example.com/${"a".repeat(2100)}`])(
    "rejects %s",
    (value) => {
      expect(parsePreviewUrl(value)).toBeNull();
    },
  );
});

describe("images", () => {
  it("passes on an image as a data uri of the sniffed type, not the announced one", async () => {
    const { service, base } = await start({ "/i": send("application/octet-stream", PNG) });
    await expect(service.preview(`${base}/i`)).rejects.toMatchObject({ reason: "unsupported" });
    server!.hits.clear();
    const { service: second, base: secondBase } = await start({ "/i": send("image/jpeg", PNG) });
    const preview = await second.preview(`${secondBase}/i`);
    expect(preview).toMatchObject({ kind: "image", image: { mime: "image/png", bytes: PNG.length } });
    if (preview.kind === "image") expect(preview.image.dataUri.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("refuses a page that calls itself an image", async () => {
    const { service, base } = await start({ "/fake.png": send("image/png", "<html><script>alert(1)</script></html>") });
    expect(await reason(service.preview(`${base}/fake.png`))).toBe("unsupported");
  });

  it("passes on a plain svg and refuses one with script", async () => {
    const { service, base } = await start({
      "/ok.svg": send("image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>'),
      "/bad.svg": send("image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    expect(await service.preview(`${base}/ok.svg`)).toMatchObject({ kind: "image", image: { mime: "image/svg+xml" } });
    expect(await reason(service.preview(`${base}/bad.svg`))).toBe("unsupported");
  });

  it("keeps svg to its own smaller limit and offers no click for it", async () => {
    const svg = `<svg>${"<g/>".repeat(100)}</svg>`;
    const { service, base } = await start({ "/a.svg": sized("image/svg+xml", Buffer.from(svg)) }, { svgBytes: 100 });
    expect(await reason(service.preview(`${base}/a.svg`))).toBe("too-large");
    expect(await reason(service.preview(`${base}/a.svg`, true))).toBe("too-large");
  });

  it("offers an image above the inline limit and loads it on request", async () => {
    const { service, base, limits } = await start({ "/big": sized("image/png", BIG_PNG) }, { imageBytes: 1000, clickImageBytes: 10_000 });
    expect(limits.imageBytes).toBe(1000);
    expect(await service.preview(`${base}/big`)).toEqual({ kind: "image-pending", url: `${base}/big`, bytes: BIG_PNG.length });
    const full = await service.preview(`${base}/big`, true);
    expect(full).toMatchObject({ kind: "image", image: { bytes: BIG_PNG.length } });
  });

  it("refuses an image above the click limit", async () => {
    const { service, base } = await start({ "/huge": sized("image/png", BIG_PNG) }, { imageBytes: 1000, clickImageBytes: 2000 });
    expect(await reason(service.preview(`${base}/huge`, true))).toBe("too-large");
  });

  it("does not keep an image that was loaded on request", async () => {
    const { service, base } = await start({ "/big": sized("image/png", BIG_PNG) }, { imageBytes: 1000, clickImageBytes: 10_000 });
    await service.preview(`${base}/big`, true);
    await service.preview(`${base}/big`, true);
    expect(server!.hits.get("/big")).toBe(2);
  });
});

describe("pages", () => {
  const html = (head: string) => send("text/html; charset=utf-8", `<!doctype html><html><head>${head}</head><body>x</body></html>`);

  it("builds a card from the open graph tags and brings its picture", async () => {
    const { service, base } = await start({
      "/p": html(
        '<meta property="og:site_name" content="Site"><meta property="og:title" content="Title"><meta property="og:description" content="About"><meta property="og:image" content="/pic.png">',
      ),
      "/pic.png": send("image/png", PNG),
    });
    const preview = await service.preview(`${base}/p`);
    expect(preview).toMatchObject({ kind: "page", siteName: "Site", title: "Title", description: "About", image: { mime: "image/png" } });
  });

  it("falls back to the host name and shows the card without a picture that cannot be used", async () => {
    const { service, base } = await start({
      "/p": html('<meta property="og:description" content="Only text"><meta property="og:image" content="/missing.png">'),
    });
    expect(await service.preview(`${base}/p`)).toMatchObject({
      kind: "page",
      siteName: "site.test",
      title: "site.test",
      description: "Only text",
    });
    expect((await service.preview(`${base}/p`)) as object).not.toHaveProperty("image");
  });

  it("refuses a page with nothing to show", async () => {
    const { service, base } = await start({ "/empty": html("") });
    expect(await reason(service.preview(`${base}/empty`))).toBe("unsupported");
  });

  it("does not run when the picture of a card points into a private network", async () => {
    server = await startServer({
      "/p": html('<meta property="og:title" content="T"><meta property="og:image" content="http://internal.test/secret.png">'),
      "/secret.png": send("image/png", PNG),
    });
    const service = new LinkPreviewService({
      getLimits: () => DEFAULT_LINK_PREVIEW_LIMITS,
      policy: localPolicy(server.port, {
        allowedPorts: [80, server.port],
        resolve: async (host) => [{ address: host === "internal.test" ? "10.0.0.9" : "127.0.0.1", family: 4 }],
        isRestricted: (address) => address === "10.0.0.9",
      }),
    });
    const preview = await service.preview(`http://site.test:${server.port}/p`);
    expect(preview).toMatchObject({ kind: "page", title: "T" });
    expect(preview as object).not.toHaveProperty("image");
    expect(server.hits.get("/secret.png")).toBeUndefined();
  });

  it("finishes cards even when only one fetch runs at a time", async () => {
    const routes: Parameters<typeof startServer>[0] = { "/pic.png": send("image/png", PNG) };
    for (let index = 0; index < 5; index++)
      routes[`/p${index}`] = html(`<meta property="og:title" content="T${index}"><meta property="og:image" content="/pic.png">`);
    const { service, base } = await start(routes, {}, 1);
    const previews = await Promise.all([0, 1, 2, 3, 4].map((index) => service.preview(`${base}/p${index}`)));
    expect(previews.every((preview) => preview.kind === "page" && preview.image)).toBe(true);
    expect(server!.hits.get("/pic.png")).toBe(1);
  });
});

describe("cache and failures", () => {
  it("answers a repeated request from the cache", async () => {
    const { service, base } = await start({ "/i": send("image/png", PNG) });
    await service.preview(`${base}/i`);
    await service.preview(`${base}/i`);
    expect(server!.hits.get("/i")).toBe(1);
  });

  it("asks the host once for requests that arrive together", async () => {
    const { service, base } = await start({ "/i": send("image/png", PNG) });
    await Promise.all([service.preview(`${base}/i`), service.preview(`${base}/i`), service.preview(`${base}/i`)]);
    expect(server!.hits.get("/i")).toBe(1);
  });

  it("remembers a failure for a short while", async () => {
    const { service, base } = await start({ "/gone": send("text/plain", "no", 404) });
    expect(await reason(service.preview(`${base}/gone`))).toBe("failed");
    expect(await reason(service.preview(`${base}/gone`))).toBe("failed");
    expect(server!.hits.get("/gone")).toBe(1);
  });

  it("reports an invalid address and a blocked one with their reasons", async () => {
    const { service } = await start({});
    expect(await reason(service.preview("not a url"))).toBe("invalid");
    const strict = new LinkPreviewService({ getLimits: () => DEFAULT_LINK_PREVIEW_LIMITS });
    expect(await reason(strict.preview("http://127.0.0.1/"))).toBe("blocked");
    expect(await reason(strict.preview("http://169.254.169.254/"))).toBe("blocked");
  });

  it("follows a changed cache budget", async () => {
    let cacheBytes = DEFAULT_LINK_PREVIEW_LIMITS.cacheBytes;
    server = await startServer({ "/i": send("image/png", PNG) });
    const service = new LinkPreviewService({
      getLimits: () => ({ ...DEFAULT_LINK_PREVIEW_LIMITS, cacheBytes }),
      policy: localPolicy(server.port),
    });
    cacheBytes = 10;
    await service.preview(`http://site.test:${server.port}/i`);
    await service.preview(`http://site.test:${server.port}/i`);
    expect(server.hits.get("/i")).toBe(2);
  });
});
