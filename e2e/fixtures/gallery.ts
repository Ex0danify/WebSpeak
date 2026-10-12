import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer as createSocketServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webDir = fileURLToPath(new URL("../../web", import.meta.url));

export interface GalleryServer {
  /** Origin of the dev server, the gallery is at `/__ui`. */
  url: string;
  close(): Promise<void>;
}

/**
 * Starts Vite's dev server on the web app's own config. The component gallery (`/__ui`) is only registered when
 * `import.meta.env.DEV` is true, so the production build the gateway serves lacks it. HMR is off and the dependency cache is a
 * temp directory, so workers starting servers together don't share a cache.
 */
export async function startGalleryServer(): Promise<GalleryServer> {
  // The web app's own Vite (the root has another one, from Vitest).
  const vite = (await import(pathToFileURL(createRequire(join(webDir, "package.json")).resolve("vite")).href)) as typeof import("vite");
  const cacheDir = mkdtempSync(join(tmpdir(), "webspeak-gallery-"));
  const port = await freePort();
  const server = await vite.createServer({
    root: webDir,
    cacheDir,
    logLevel: "error",
    clearScreen: false,
    server: { host: "127.0.0.1", port, strictPort: true, hmr: false, proxy: {} },
    // Look for every dependency up front, or Vite finds one while a page is open and reloads it.
    optimizeDeps: { entries: ["src/main.ts", "src/views/UiGallery.vue"] },
  });
  await server.listen();
  await server.warmupRequest("/src/main.ts");
  await server.warmupRequest("/src/views/UiGallery.vue");
  await server.waitForRequestsIdle();
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await server.close();
      rmSync(cacheDir, { recursive: true, force: true });
    },
  };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createSocketServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}
