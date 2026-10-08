import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
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

export default defineConfig({
  plugins: [vue(), tailwindcss(), languageTags()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3040",
      "/ws": {
        target: "ws://localhost:3040",
        ws: true,
      },
    },
  },
});
