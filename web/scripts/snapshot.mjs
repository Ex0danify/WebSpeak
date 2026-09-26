// Visual snapshot harness. Serves the built app with `vite preview`, mocks /api/**
// and captures a fixed set of screenshots into .snapshots/<label>/.
//
//   npm run snapshot -- --label baseline
//   npm run snapshot -- --label after [--no-build] [--only join-en]
//
// Env: CHROMIUM_PATH (default /usr/bin/chromium-browser)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { adminApi, adminScreens } from "./snapshot-admin.mjs";
import { connectedScenarios, installVoiceFixture } from "./snapshot-fixture.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const label = option("label", "current");
const only = option("only", "");
const port = Number(option("port", "4173"));
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser";
const outDir = join(root, ".snapshots", label);

const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const themes = ["light", "dark"];

// One entry per screen. `langs` are the languages captured for that screen.
const screens = [
  { id: "join", path: "/", langs: ["en", "zh", "de"] },
  { id: "demo", path: "/demo", langs: ["en"] },
  { id: "admin-login", path: "/admin/login", langs: ["en"] },
  ...adminScreens,
];

const publicConfig = {
  version: "0.0.0-snapshot",
  initialized: true,
  siteName: "WebSpeak",
  welcomeText: "欢迎来到 WebSpeak",
  welcomeTextEn: "Welcome to WebSpeak",
  welcomeTexts: {
    zh: "欢迎来到 WebSpeak",
    en: "Welcome to WebSpeak",
    de: "Willkommen bei WebSpeak",
    ru: "Добро пожаловать в WebSpeak",
    ja: "WebSpeak へようこそ",
  },
  accessMode: "fixed",
  target: "ts.example.com:9987",
  visitorNumber: 1234,
  visitorTotal: 5678,
  accelerationAvailable: false,
  accelerationRelays: [],
};

async function mockApi(context, admin) {
  await context.route("**/api/**", (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/public-config") return json(200, publicConfig);
    const authenticated = admin ? adminApi(pathname) : null;
    if (authenticated) return json(...authenticated);
    if (pathname === "/api/admin/session") return json(200, { authenticated: false });
    return json(404, { error: "NOT_MOCKED" });
  });
}

function build() {
  console.log("building (vite build)...");
  const result = spawnSync("npx", ["vite", "build"], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("vite build failed");
}

async function startPreview() {
  const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return { server, url };
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill();
  throw new Error(`vite preview did not start on ${url}`);
}

// A silent WAV for Chromium's fake microphone, so the input meter stays flat.
function writeSilentWav() {
  const dir = mkdtempSync(join(tmpdir(), "webspeak-snapshot-"));
  const path = join(dir, "silence.wav");
  const samples = 48000;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(96000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples * 2, 40);
  writeFileSync(path, Buffer.concat([header, Buffer.alloc(samples * 2)]));
  return { dir, path };
}

async function capture(browser, url, { name, path, lang, theme, viewport, scenario, mobileTab, admin }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: theme,
    locale: lang === "zh" ? "zh-CN" : lang,
    timezoneId: "UTC",
    permissions: ["microphone"],
  });
  let fixture = null;
  try {
    await context.addInitScript(({ language, themeMode }) => {
      try {
        localStorage.setItem("webspeak:language", language);
        localStorage.setItem("webspeak:theme", themeMode);
      } catch {
        // storage unavailable
      }
    }, { language: lang, themeMode: theme });
    await mockApi(context, admin);
    if (scenario) fixture = await installVoiceFixture(context);
    const page = await context.newPage();
    await page.goto(url + path, { waitUntil: "networkidle" });
    if (fixture) {
      await page.fill("#nickname", "Snapshot Tester");
      await page.click(".join-form button[type=submit]");
      await page.waitForSelector(".join-page", { state: "detached" });
      fixture.apply(scenario);
      // On phones one panel shows at a time; the banners live on the Voice tab.
      if (mobileTab && viewport.width <= 740) await page.locator(".mobile-nav").locator("button, [role=tab]").filter({ hasText: mobileTab }).click();
      // Let the room render and the WebSocket frames settle.
      await page.waitForTimeout(600);
    }
    await page.addStyleTag({ content: "*,*::before,*::after{caret-color:transparent!important;animation:none!important;transition:none!important}" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false });
  } finally {
    fixture?.stop();
    await context.close();
  }
  console.log(`  ${name}`);
}

async function main() {
  if (!existsSync(chromiumPath)) throw new Error(`Chromium not found at ${chromiumPath}; set CHROMIUM_PATH`);
  if (!flag("no-build")) build();
  else if (!existsSync(join(root, "dist"))) throw new Error("dist/ missing; run without --no-build");

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // Every shot the harness takes. `scenario` drives the scripted gateway.
  const jobs = [];
  for (const screen of screens) {
    for (const lang of screen.langs) {
      for (const theme of themes) {
        for (const [sizeName, viewport] of Object.entries(sizes)) {
          jobs.push({ name: `${screen.id}-${lang}-${theme}-${sizeName}`, path: screen.path, lang, theme, viewport, admin: screen.admin });
        }
      }
    }
  }
  for (const scenario of connectedScenarios) {
    for (const theme of themes) {
      for (const [sizeName, viewport] of Object.entries(sizes)) {
        jobs.push({ name: `room-${scenario}-en-${theme}-${sizeName}`, path: "/", lang: "en", theme, viewport, scenario, mobileTab: "Voice" });
      }
    }
  }
  // Phone default tab (channel list); on desktop it is identical to room-connected.
  for (const theme of themes) {
    jobs.push({ name: `room-channels-en-${theme}-mobile`, path: "/", lang: "en", theme, viewport: sizes.mobile, scenario: "connected" });
    // The other two phone tabs: the chat with its composer, and the More panel.
    jobs.push({ name: `room-chat-en-${theme}-mobile`, path: "/", lang: "en", theme, viewport: sizes.mobile, scenario: "connected", mobileTab: "Chat" });
    jobs.push({ name: `room-more-en-${theme}-mobile`, path: "/", lang: "en", theme, viewport: sizes.mobile, scenario: "connected", mobileTab: "More" });
  }

  const wav = writeSilentWav();
  const { server, url } = await startPreview();
  const browser = await chromium.launch({
    executablePath: chromiumPath,
    args: [
      "--font-render-hinting=none",
      "--disable-lcd-text",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav.path}`,
    ],
  });
  let count = 0;
  try {
    for (const job of jobs) {
      if (only && !job.name.includes(only)) continue;
      await capture(browser, url, job);
      count += 1;
    }
  } finally {
    await browser.close();
    server.kill();
    rmSync(wav.dir, { recursive: true, force: true });
  }
  console.log(`captured ${count} screenshots into ${outDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
