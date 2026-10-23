import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// index.html sets <html lang> before paint and cannot import the language registry, so the
// code -> BCP 47 tag table comes from the same `meta` exports (common/<code>.ts) at build time.
function languageTags(): Plugin {
  const dir = fileURLToPath(new URL("./src/shared/i18n/common/", import.meta.url));
  return {
    name: "language-tags",
    transformIndexHtml(html) {
      const tags: Record<string, string> = {};
      for (const file of readdirSync(dir)) {
        const code = file.match(/^(?!index\.)(.+)\.ts$/)?.[1];
        const tag = code && readFileSync(dir + file, "utf8").match(/export const meta = \{[^}]*\btag: "([^"]+)"/)?.[1];
        if (code && tag) tags[code] = tag;
      }
      return html.replace("__LANGUAGE_TAGS__", JSON.stringify(tags));
    },
  };
}

// The dev server proxies to the gateway on the port the gateway itself reads from WEBSPEAK_PORT (root .env included).
// Without it there is no proxy rather than a guess: builds and the e2e gallery run without a gateway.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "WEBSPEAK_");
  const gatewayPort = env.WEBSPEAK_PORT?.trim();
  // 127.0.0.1, not localhost: a 127.0.0.1-bound gateway is unreachable once Node resolves localhost to ::1 first.
  const gatewayHost = `127.0.0.1:${gatewayPort}`;
  return {
    plugins: [vue(), tailwindcss(), languageTags()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: gatewayPort
        ? {
            // The gateway gates its API on same origin. The browser's :5173 origin never matches, so the
            // proxy presents the gateway's own origin; production keeps the real check across hosts.
            "/api": {
              target: `http://${gatewayHost}`,
              changeOrigin: true,
              configure: (proxy) => {
                proxy.on("proxyReq", (proxyReq) => proxyReq.setHeader("origin", `http://${gatewayHost}`));
              },
            },
            "/ws": { target: `ws://${gatewayHost}`, ws: true },
          }
        : {},
    },
  };
});
