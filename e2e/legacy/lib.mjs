import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
const require = createRequire("/home/ex0/Git/WebSpeak/web/package.json");
export const { chromium } = require("playwright-core");
export const URL_BASE = "http://127.0.0.1:3040";

// 5 s tone burst WAV (loops) so VOX opens and the receiving side has audio to relay.
export function writeTone(path, { amp = 0.5, freq = 440 } = {}) {
  const rate = 48000, n = rate * 5, h = Buffer.alloc(44), d = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / rate) * amp * 32767), i * 2);
  h.write("RIFF", 0); h.writeUInt32LE(36 + d.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(d.length, 40);
  writeFileSync(path, Buffer.concat([h, d]));
}
// smoke-A and smoke-B keep one browser profile each (IndexedDB holds the remembered
// TeamSpeak identity), so they are the same TeamSpeak clients on every run.
export const PROFILE_ROOT = homedir() + "/.cache/webspeak-smoke";
let currentWav = "";
const persistent = [];
const launchArgs = (wav) => ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required", "--auto-accept-this-tab-capture", "--auto-select-desktop-capture-source=Entire screen", "--enable-usermedia-screen-capturing", "--auto-select-tab-capture-source-by-title=WebSpeak"];
export async function launch(wav) {
  currentWav = wav;
  const real = await chromium.launch({ executablePath: "/usr/bin/chromium-browser", args: launchArgs(wav) });
  return new Proxy(real, { get(t, k) { if (k === "close") return async () => { for (const c of persistent.splice(0)) await c.close().catch(() => {}); await t.close(); }; const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } });
}

export const results = [];
export function rec(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail });
  console.log(`${ok === true ? "PASS" : ok === false ? "FAIL" : "NOTE"} [${id}] ${name}${detail ? " — " + detail : ""}`);
}
export async function openSession(browser, nick, { viewport = { width: 1440, height: 900 }, lang = "en", theme = "light", touch = false, join = true, extraPerms = [] } = {}) {
  const opts = { viewport, permissions: ["microphone", ...extraPerms], locale: lang, colorScheme: theme, hasTouch: touch, isMobile: touch };
  let ctx;
  if (/^smoke-[AB]$/.test(nick)) {
    const dir = `${PROFILE_ROOT}/${nick}`; mkdirSync(dir, { recursive: true });
    ctx = await chromium.launchPersistentContext(dir, { executablePath: "/usr/bin/chromium-browser", args: launchArgs(currentWav), ...opts });
    persistent.push(ctx);
  } else ctx = await browser.newContext(opts);
  await ctx.addInitScript(({ lang }) => { try { if (!localStorage.getItem("webspeak:language")) localStorage.setItem("webspeak:language", lang); } catch {} }, { lang });
  const page = await ctx.newPage();
  const s = { ctx, page, texts: [], binary: 0, sent: 0, errors: [] };
  page.on("pageerror", (e) => s.errors.push(String(e).slice(0, 200)));
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => { if (typeof f.payload === "string") { try { s.texts.push(JSON.parse(f.payload)); } catch {} } else s.binary++; });
    ws.on("framesent", (f) => { if (typeof f.payload !== "string") s.sent++; });
  });
  await page.goto(URL_BASE + "/", { waitUntil: "networkidle" });
  if (join) {
    await page.fill("#nickname", nick);
    await page.click(".join-form button[type=submit]");
    await page.waitForSelector(".join-page", { state: "detached", timeout: 20000 });
    await page.waitForTimeout(1500);
  }
  s.identity = s.texts.find((m) => typeof m.identity === "string")?.identity;
  s.of = (type) => s.texts.filter((m) => m.type === type);
  return s;
}
export const focusDesc = (page) => page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return "body"; const cs = getComputedStyle(e); return { tag: e.tagName.toLowerCase(), label: (e.getAttribute("aria-label") || e.textContent || e.id || "").trim().replace(/\s+/g, " ").slice(0, 34), ow: parseFloat(cs.outlineWidth), os: cs.outlineStyle, oc: cs.outlineColor, shadow: cs.boxShadow !== "none", inDialog: !!e.closest("[role=dialog]") }; });
